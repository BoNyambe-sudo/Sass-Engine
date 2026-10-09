import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { AccessTokenGuard, CurrentAuth } from '../auth/auth.context.js';
import type { AuthContext } from '../auth/auth.context.js';

@Controller('analytics')
@UseGuards(AccessTokenGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview(
    @CurrentAuth() auth: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getOverview(auth.organizationId, from, to);
  }
}
