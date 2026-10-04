import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AccessTokenGuard,
  AuthContext,
  CurrentAuth,
  Roles,
  RolesGuard,
} from '../auth/auth.context.js';
import { CheckoutDto } from './billing.dto.js';
import { BillingService } from './billing.service.js';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  getPlans() {
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
      throw new BadRequestException('Missing Stripe signature or raw request body');
    }
    return this.billing.handleWebhook(request.rawBody, signature);
  }
}
