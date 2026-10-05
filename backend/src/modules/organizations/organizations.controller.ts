import {
  Body,
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  CurrentAuth,
  Roles,
  RolesGuard,
} from '../auth/auth.context.js';
import type { AuthContext } from '../auth/auth.context.js';
import { UpdateOrganizationDto } from '../auth/auth.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { Membership, Organization, Subscription } from '../database/models.js';

@Controller('organizations')
@UseGuards(AccessTokenGuard, RolesGuard)
export class OrganizationsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get('current')
  async current(@CurrentAuth() auth: AuthContext) {
    const organization = await this.database
      .getModel<Organization>('Organization')
      .findById(auth.organizationId)
      .select('name slug createdAt')
      .lean();
    if (!organization) throw new NotFoundException('Organization not found');
    const [members, subscription] = await Promise.all([
      this.database
        .getModel<Membership>('Membership')
        .countDocuments({ organizationId: auth.organizationId }),
      this.database
        .getModel<Subscription>('Subscription')
        .findOne({ organizationId: auth.organizationId })
        .select('plan status currentPeriodEnd')
        .lean(),
    ]);
    return {
      id: organization._id.toString(),
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      memberCount: members,
      subscription: subscription ?? { plan: 'free', status: 'inactive' },
    };
  }

  @Patch('current')
  @Roles('ADMIN')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateOrganizationDto,
  ) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Organization name is required');
    }
    const organization = await this.database
      .getModel<Organization>('Organization')
      .findOneAndUpdate(
        { _id: auth.organizationId },
        { $set: { name: dto.name } },
        { returnDocument: 'before', runValidators: true },
      )
      .select('name slug');
    if (!organization) throw new NotFoundException('Organization not found');
    await this.audit.record({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'organization.updated',
      targetType: 'organization',
      targetId: auth.organizationId,
      metadata: { name: organization.name },
    });
    return {
      id: organization._id.toString(),
      name: organization.name,
      slug: organization.slug,
    };
  }
}
