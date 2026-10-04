import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { DatabaseService } from '../database/database.service.js';
import {
  Organization,
  Subscription,
  StripeEvent,
  User,
} from '../database/models.js';
import { AuditService } from '../audit/audit.service.js';

const planDetails = [
  { key: 'starter', name: 'Starter', features: ['Core analytics', 'Up to 5 seats'] },
  { key: 'growth', name: 'Growth', features: ['Advanced analytics', 'Up to 25 seats'] },
  { key: 'scale', name: 'Scale', features: ['Custom reporting', 'Unlimited seats'] },
] as const;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  getPlans() {
    return planDetails.map((plan) => ({
      ...plan,
      available: Boolean(process.env[`STRIPE_PRICE_${plan.key.toUpperCase()}`]),
    }));
  }

  async getSubscription(organizationId: string) {
    return (
      (await this.database
        .getModel<Subscription>('Subscription')
        .findOne({ organizationId })
        .select('-__v')
        .lean()) ?? {
        plan: 'free',
        status: 'inactive',
        amountCents: 0,
        currency: 'usd',
        currentPeriodEnd: null,
      }
    );
  }

  async createCheckoutSession(
    organizationId: string,
    plan: (typeof planDetails)[number]['key'],
  ) {
    const stripe = this.getStripe();
    const price = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
    if (!price) {
      throw new ServiceUnavailableException(`Stripe price for ${plan} is not configured`);
    }
    const successUrl = this.requiredUrl('STRIPE_CHECKOUT_SUCCESS_URL');
    const cancelUrl = this.requiredUrl('STRIPE_CHECKOUT_CANCEL_URL');
    const organizations = this.database.getModel<Organization>('Organization');
    const organization = await organizations.findById(organizationId);
    if (!organization) throw new NotFoundException('Organization not found');

    const subscriptions = this.database.getModel<Subscription>('Subscription');
    let subscription = await subscriptions.findOne({ organizationId });
    if (!subscription) {
      subscription = await subscriptions.create({ organizationId });
    }
    let customerId = subscription.stripeCustomerId;
    if (!customerId) {
      const owner = await this.database.getModel<User>('User').findById(organization.ownerId);
      const customer = await stripe.customers.create({
        name: organization.name,
        ...(owner ? { email: owner.email } : {}),
        metadata: { organizationId },
      });
      customerId = customer.id;
      subscription.stripeCustomerId = customerId;
      await subscription.save();
    }
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organizationId,
      metadata: { organizationId, plan },
      subscription_data: { metadata: { organizationId, plan } },
      allow_promotion_codes: true,
    });
    if (!checkout.url) throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    return { url: checkout.url };
  }

  async createPortalSession(organizationId: string) {
    const stripe = this.getStripe();
    const subscription = await this.database
      .getModel<Subscription>('Subscription')
      .findOne({ organizationId });
    if (!subscription?.stripeCustomerId) {
      throw new NotFoundException('No billing customer is set up for this organization');
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: this.requiredUrl('STRIPE_PORTAL_RETURN_URL'),
    });
    return { url: portal.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    const stripe = this.getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    const events = this.database.getModel<StripeEvent>('StripeEvent');
    const now = new Date();
    let acquired = false;
    try {
      await events.create({
        eventId: event.id,
        type: event.type,
        status: 'processing',
        lockedUntil: new Date(now.getTime() + 120_000),
      });
      acquired = true;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await events.findOne({ eventId: event.id });
      if (existing?.status === 'processed') {
        return { received: true, duplicate: true };
      }
      const lock = await events.updateOne(
        {
          eventId: event.id,
          status: 'processing',
          lockedUntil: { $lte: now },
        },
        { $set: { lockedUntil: new Date(now.getTime() + 120_000), type: event.type } },
      );
      if (lock.modifiedCount === 0) {
        throw new ServiceUnavailableException(
          'This Stripe event is already being processed; retry delivery',
        );
      }
      acquired = true;
    }

    try {
      await this.processEvent(event);
      await events.updateOne(
        { eventId: event.id, status: 'processing' },
        { $set: { status: 'processed', processedAt: new Date() } },
      );
      return { received: true };
    } catch (error) {
      if (acquired) {
        await events.deleteOne({ eventId: event.id, status: 'processing' });
      }
      this.logger.error(`Failed to process Stripe event ${event.id}`, error);
      throw error;
    }
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkout = event.data.object as Stripe.Checkout.Session;
        const organizationId =
          checkout.metadata?.organizationId ?? checkout.client_reference_id;
        if (!organizationId) throw new Error('Checkout event is missing organization metadata');
        await this.database.getModel<Subscription>('Subscription').updateOne(
          { organizationId },
          {
            $set: {
              stripeCustomerId: this.idOf(checkout.customer),
              stripeSubscriptionId: this.idOf(checkout.subscription),
              plan: checkout.metadata?.plan ?? 'paid',
              status: 'active',
            },
            $setOnInsert: { organizationId },
          },
          { upsert: true },
        );
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.processSubscription(event.data.object as Stripe.Subscription, event.type);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = this.idOf(invoice.customer);
        if (!customerId) throw new Error('Invoice event is missing the Stripe customer');
        const updated = await this.database.getModel<Subscription>('Subscription').findOneAndUpdate(
          { stripeCustomerId: customerId, status: { $ne: 'canceled' } },
          {
            $set: {
              status: event.type === 'invoice.paid' ? 'active' : 'past_due',
              ...(event.type === 'invoice.paid' ? { canceledAt: null } : {}),
            },
          },
          { new: true },
        );
        if (updated) {
          await this.audit.record({
            organizationId: updated.organizationId.toString(),
            actorId: null,
            action: event.type === 'invoice.paid' ? 'billing.invoice_paid' : 'billing.payment_failed',
            targetType: 'subscription',
            targetId: updated.stripeSubscriptionId,
          });
        }
        break;
      }
      default:
        this.logger.debug(`Acknowledging unsupported Stripe event ${event.type}`);
    }
  }

  private async processSubscription(
    subscription: Stripe.Subscription,
    eventType: string,
  ): Promise<void> {
    const item = subscription.items.data[0];
    const metadata = subscription.metadata;
    const organizationId = metadata.organizationId;
    const customerId = this.idOf(subscription.customer);
    const price = item?.price;
    const amount = (price?.unit_amount ?? 0) * (item?.quantity ?? 1);
    const interval = price?.recurring?.interval;
    const intervalCount = price?.recurring?.interval_count ?? 1;
    const monthlyAmount =
      interval === 'year'
        ? amount / (intervalCount * 12)
        : interval === 'week'
          ? (amount * 52) / (intervalCount * 12)
          : interval === 'day'
            ? (amount * 365) / (intervalCount * 12)
            : amount / intervalCount;
    const canceledAt =
      subscription.status === 'canceled'
        ? new Date((subscription.canceled_at ?? Math.floor(Date.now() / 1000)) * 1000)
        : null;
    const filter = organizationId
      ? { organizationId }
      : customerId
        ? { stripeCustomerId: customerId }
        : null;
    if (!filter) throw new Error('Subscription event is missing organization and customer IDs');
    if (!organizationId && !(await this.database.getModel<Subscription>('Subscription').exists(filter))) {
      throw new Error('Subscription does not match a known organization');
    }
    const updated = await this.database.getModel<Subscription>('Subscription').findOneAndUpdate(
      filter,
      {
        $set: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          plan: metadata.plan ?? price?.lookup_key ?? 'paid',
          status: subscription.status,
          amountCents: Math.round(monthlyAmount),
          currency: price?.currency ?? 'usd',
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null,
          canceledAt,
        },
        ...(organizationId ? { $setOnInsert: { organizationId } } : {}),
      },
      { upsert: Boolean(organizationId), new: true },
    );
    if (updated) {
      await this.audit.record({
        organizationId: updated.organizationId.toString(),
        actorId: null,
        action: 'billing.subscription_changed',
        targetType: 'subscription',
        targetId: subscription.id,
        metadata: {
          plan: updated.plan,
          status: updated.status,
          eventType,
        },
      });
    }
  }

  private getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new ServiceUnavailableException('Stripe is not configured');
    return new Stripe(key);
  }

  private requiredUrl(name: string): string {
    const value = process.env[name];
    if (!value) throw new ServiceUnavailableException(`${name} is not configured`);
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.toString();
    } catch {
      throw new ServiceUnavailableException(`${name} must be a valid HTTP(S) URL`);
    }
  }

  private idOf(value: string | { id: string } | null | undefined): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }
}
