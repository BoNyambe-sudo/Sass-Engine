import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import {
  AccessTokenGuard,
  CurrentAuth,
  Roles,
  RolesGuard,
} from '../auth/auth.context.js';
import type { AuthContext } from '../auth/auth.context.js';
import { CheckoutDto } from './billing.dto.js';
import { BillingService } from './billing.service.js';

type PlanKey = 'starter' | 'growth' | 'scale';

interface PlanResponse {
  key: PlanKey;
  name: string;
  features: string[];
  tagline: string;
  available: boolean;
  priceId?: string;
  amountCents?: number;
  currency?: string;
  interval?: string;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  getPlans(): Promise<PlanResponse[]> {
    return this.billing.getPlans();
  }

  @Get('subscription')
  @UseGuards(AccessTokenGuard)
  getSubscription(@CurrentAuth() auth: AuthContext) {
    return this.billing.getSubscription(auth.organizationId);
  }

  @Post('checkout')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN')
  createCheckoutSession(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CheckoutDto,
  ) {
    return this.billing.createCheckoutSession(auth.organizationId, dto.plan);
  }

  @Post('portal')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('ADMIN')
  createPortalSession(@CurrentAuth() auth: AuthContext) {
    return this.billing.createPortalSession(auth.organizationId);
  }

  @Post('webhook')
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!signature || !request.rawBody) {
      throw new BadRequestException(
        'Missing Stripe signature or raw request body',
      );
    }
    return this.billing.handleWebhook(request.rawBody, signature);
  }
}
