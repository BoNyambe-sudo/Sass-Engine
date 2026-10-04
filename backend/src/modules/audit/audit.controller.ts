import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuditLog } from '../database/models.js';
import {
  AccessTokenGuard,
  AuthContext,
  CurrentAuth,
  Roles,
  RolesGuard,
} from '../auth/auth.context.js';
import { DatabaseService } from '../database/database.service.js';

@Controller('audit')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly database: DatabaseService) {}

  @Get('logs')
  async getLogs(
    @CurrentAuth() auth: AuthContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const query = { organizationId: auth.organizationId };
    const [items, total] = await Promise.all([
      this.database
        .getModel<AuditLog>('AuditLog')
        .find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .populate('actorId', 'name email')
        .lean(),
      this.database.getModel<AuditLog>('AuditLog').countDocuments(query),
    ]);
    return { items, page: safePage, limit: safeLimit, total };
  }
}
