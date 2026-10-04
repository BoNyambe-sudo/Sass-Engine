import { BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from './billing.service.js';

describe('BillingService webhooks', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_unit_test_secret');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_unit_test_secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects invalid webhook signatures', async () => {
    const database = { getModel: vi.fn() } as unknown as DatabaseService;
    const service = new BillingService(
      database,
      { record: vi.fn() } as unknown as AuditService,
    );

    await expect(
      service.handleWebhook(Buffer.from('{}'), 'invalid-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.getModel).not.toHaveBeenCalled();
  });

  it('acknowledges a completed event delivery only once', async () => {
    const payload = JSON.stringify({
      id: 'evt_already_processed',
      object: 'event',
      api_version: '2026-01-01',
      created: 1_791_129_600,
      data: { object: {} },
      livemode: false,
      pending_webhooks: 1,
      type: 'customer.updated',
    });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const events = {
      create: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 })),
      findOne: vi.fn().mockResolvedValue({ status: 'processed' }),
    };
    const database = {
      getModel: vi.fn(() => events),
    } as unknown as DatabaseService;
    const service = new BillingService(
      database,
      { record: vi.fn() } as unknown as AuditService,
    );

    await expect(service.handleWebhook(Buffer.from(payload), signature)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(events.findOne).toHaveBeenCalledWith({ eventId: 'evt_already_processed' });
  });
});
