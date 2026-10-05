import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.context.js';
import { ChangeRoleDto } from '../auth/auth.dto.js';
import { DatabaseService } from '../database/database.service.js';
import {
  Invitation,
  Membership,
  Organization,
  User,
} from '../database/models.js';
import type { Role } from '../database/models.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  async getUsers(organizationId: string, page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const membershipsModel = this.database.getModel<Membership>('Membership');
    const query = { organizationId };
    const [memberships, total] = await Promise.all([
      membershipsModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      membershipsModel.countDocuments(query),
    ]);
    const users = await this.database
      .getModel<User>('User')
      .find({ _id: { $in: memberships.map((member) => member.userId) } })
      .select('name email createdAt')
      .lean();
    const userById = new Map(
      users.map((user) => [user._id.toString(), user] as const),
    );

    return {
      items: memberships.flatMap((member) => {
        const user = userById.get(member.userId.toString());
        return user
          ? [
              {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: member.role,
                joinedAt: member.createdAt,
              },
            ]
          : [];
      }),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  getInvitations(organizationId: string) {
    return this.database
      .getModel<Invitation>('Invitation')
      .find({
        organizationId,
        acceptedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .select('email role expiresAt createdAt')
      .sort({ createdAt: -1 })
      .lean();
  }

  async revokeInvitation(auth: AuthContext, invitationId: string) {
    if (!Types.ObjectId.isValid(invitationId)) {
      throw new BadRequestException('Invalid invitation ID');
    }
    const invitations = this.database.getModel<Invitation>('Invitation');
    const invitation = await invitations
      .findOne({
        _id: invitationId,
        organizationId: auth.organizationId,
        acceptedAt: null,
      })
      .select('email role');
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (auth.role === 'MANAGER' && invitation.role !== 'VIEWER') {
      throw new ForbiddenException(
        'Managers may only revoke viewer invitations',
      );
    }
    const revoked = await invitations.findOneAndDelete({
      _id: invitationId,
      organizationId: auth.organizationId,
      acceptedAt: null,
      ...(auth.role === 'MANAGER' ? { role: 'VIEWER' } : {}),
    });
    if (!revoked) throw new NotFoundException('Invitation not found');
    await this.audit.record({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'member.invitation_revoked',
      targetType: 'invitation',
      targetId: invitationId,
      metadata: { email: invitation.email, role: invitation.role },
    });
    return { message: 'Invitation revoked.' };
  }

  async invite(auth: AuthContext, email: string, role: Role) {
    if (auth.role === 'MANAGER' && role !== 'VIEWER') {
      throw new ForbiddenException('Managers may only invite viewers');
    }
    const result = await this.authService.createInvitation(
      auth.organizationId,
      auth.userId,
      email,
      role,
    );
    await this.audit.record({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'member.invited',
      targetType: 'invitation',
      metadata: { email: email.trim().toLowerCase(), role },
    });
    return result;
  }

  async changeRole(auth: AuthContext, userId: string, dto: ChangeRoleDto) {
    const membership = await this.findMembership(auth.organizationId, userId);
    await this.preventOwnerAccessChange(auth.organizationId, userId);
    if (membership.role === 'ADMIN' && dto.role !== 'ADMIN') {
      await this.ensureAnotherAdminExists(auth.organizationId);
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

  async remove(auth: AuthContext, userId: string) {
    const membership = await this.findMembership(auth.organizationId, userId);
    await this.preventOwnerAccessChange(auth.organizationId, userId);
    if (membership.role === 'ADMIN') {
      await this.ensureAnotherAdminExists(auth.organizationId);
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

  private async ensureAnotherAdminExists(organizationId: string) {
    const admins = await this.database
      .getModel<Membership>('Membership')
      .countDocuments({ organizationId, role: 'ADMIN' });
    if (admins <= 1) {
      throw new ConflictException(
        'An organization must retain at least one admin',
      );
    }
  }

  private async preventOwnerAccessChange(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const organization = await this.database
      .getModel<Organization>('Organization')
      .findById(organizationId)
      .select('ownerId')
      .lean();
    if (organization?.ownerId.toString() === userId) {
      throw new ConflictException(
        'Transfer workspace ownership before changing the owner membership',
      );
    }
  }
}
