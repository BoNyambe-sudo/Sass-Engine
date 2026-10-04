import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_123', {
  apiVersion: '2025-03-31.basil',
});

@Controller('billing')
export class BillingController {
  @Post('checkout')
  createCheckoutSession() {
    return {
      ok: true,
      url: 'https://checkout.stripe.com/test_session_123',
      customerPortalUrl: 'https://billing.stripe.com/p/login/test_portal_123',
    };
  }

  @Get('portal')
  createPortalSession() {
    return {
      ok: true,
      url: 'https://billing.stripe.com/p/login/test_portal_123',
    };
  }

  @Post('webhook')
  handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
    @Body() body: unknown,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature');
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(body ?? {}));
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

    try {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        endpointSecret,
      );
      return {
        received: true,
        eventType: event.type,
        objectId: event.data.object.id,
      };
    } catch (error) {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }
}
