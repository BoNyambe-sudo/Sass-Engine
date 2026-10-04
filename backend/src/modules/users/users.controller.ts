import {
  BadRequestException,
  Body,
  ConflictException,
  ForbiddenException,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  AccessTokenGuard,
  AuthContext,
  CurrentAuth,
  Roles,
  RolesGuard,
} from '../auth/auth.context.js';
import { AuthService } from '../auth/auth.service.js';
import { ChangeRoleDto, InviteDto } from '../auth/auth.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { Invitation, Membership, User } from '../database/models.js';

@Controller('users')
@UseGuards(AccessTokenGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async getUsers(
    @CurrentAuth() auth: AuthContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const membershipModel = this.database.getModel<Membership>('Membership');
    const query = { organizationId: auth.organizationId };
    const [memberships, total] = await Promise.all([
      membershipModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      membershipModel.countDocuments(query),
    ]);
    const users = await this.database
      .getModel<User>('User')
      .find({ _id: { $in: memberships.map((member) => member.userId) } })
      .select('name email createdAt')
      .lean();
    const userById = new Map(users.map((user) => [user._id.toString(), user]));
    return {
      items: memberships
        .map((member) => {
          const user = userById.get(member.userId.toString());
          return user
            ? {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: member.role,
                joinedAt: member.createdAt,
              }
            : null;
        })
        .filter((member) => member !== null),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  @Get('invitations')
  @Roles('ADMIN', 'MANAGER')
  async getInvitations(@CurrentAuth() auth: AuthContext) {
    return this.database
      .getModel<Invitation>('Invitation')
      .find({
        organizationId: auth.organizationId,
        acceptedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .select('email role expiresAt createdAt')
      .sort({ createdAt: -1 })
      .lean();
  }

  @Post('invitations')
  @Roles('ADMIN', 'MANAGER')
  async invite(@CurrentAuth() auth: AuthContext, @Body() dto: InviteDto) {
    if (auth.role === 'MANAGER' && dto.role !== 'VIEWER') {
      throw new ForbiddenException('Managers may only invite viewers');
    }
    const result = await this.authService.createInvitation(
      auth.organizationId,
      auth.userId,
      dto.email,
      dto.role,
    );
    await this.audit.record({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'member.invited',
      targetType: 'invitation',
      metadata: { email: dto.email.trim().toLowerCase(), role: dto.role },
    });
    return result;
  }

  @Patch(':userId/role')
  @Roles('ADMIN')
  async changeRole(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    const membership = await this.findMembership(auth.organizationId, userId);
    if (membership.role === 'ADMIN' && dto.role !== 'ADMIN') {
      const admins = await this.database
        .getModel<Membership>('Membership')
        .countDocuments({ organizationId: auth.organizationId, role: 'ADMIN' });
      if (admins <= 1) {
        throw new ConflictException('An organization must retain at least one admin');
      }
    }
    membership.role = dto.role;
    await membership.save();
    await this.audit.record({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'member.role_changed',
      targetType: 'membership',
      targetId: userId,
      metadata: { role: dto.role },
    });
    return { userId, role: membership.role };
  }

  @Delete(':userId')
  @Roles('ADMIN')
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
  ) {
    const membership = await this.findMembership(auth.organizationId, userId);
    if (membership.role === 'ADMIN') {
      const admins = await this.database
        .getModel<Membership>('Membership')
        .countDocuments({ organizationId: auth.organizationId, role: 'ADMIN' });
      if (admins <= 1) {
        throw new ConflictException('An organization must retain at least one admin');
      }
    }
    await membership.deleteOne();
    await this.audit.record({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'member.removed',
      targetType: 'membership',
      targetId: userId,
    });
    return { message: 'Member removed.' };
  }

  private async findMembership(organizationId: string, userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const membership = await this.database
      .getModel<Membership>('Membership')
      .findOne({ organizationId, userId });
    if (!membership) throw new NotFoundException('Member not found');
    return membership;
  }
}
