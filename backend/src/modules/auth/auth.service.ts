import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service.js';
import { EmailService } from '../email/email.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessTokenExpiry } from '../../config/environment.js';
import {
  Invitation,
  Membership,
  OneTimeToken,
  Organization,
  RefreshSession,
  Role,
  User,
} from '../database/models.js';

const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function accessTokenExpiry(): AccessTokenExpiry {
  const configured = process.env.JWT_EXPIRY ?? '15m';
  switch (configured) {
    case '5m':
      return '5m';
    case '15m':
      return '15m';
    case '30m':
      return '30m';
    case '1h':
      return '1h';
    default:
      throw new Error('JWT_EXPIRY must be one of 5m, 15m, 30m, or 1h');
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly database: DatabaseService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async signup(
    email: string,
    name: string,
    password: string,
    organizationName: string,
  ) {
    const users = this.database.getModel<User>('User');
    const normalizedEmail = email.trim().toLowerCase();
    if (await users.exists({ email: normalizedEmail })) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    let user: User | null = null;
    let organization: Organization | null = null;

    try {
      user = await users.create({ email: normalizedEmail, name, passwordHash });
      const suffix = randomBytes(4).toString('hex');
      const slug = `${
        organizationName
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 48) || 'workspace'
      }-${suffix}`;
      organization = await this.database
        .getModel<Organization>('Organization')
        .create({ name: organizationName, slug, ownerId: user._id });
      await this.database.getModel<Membership>('Membership').create({
        userId: user._id,
        organizationId: organization._id,
        role: 'ADMIN',
      });
      await this.database.getModel('Subscription').create({
        organizationId: organization._id,
      });
    } catch (error) {
      if (organization) {
        await this.database
          .getModel<Membership>('Membership')
          .deleteMany({ organizationId: organization._id });
        await this.database
          .getModel('Subscription')
          .deleteOne({ organizationId: organization._id });
        await this.database
          .getModel('Organization')
          .deleteOne({ _id: organization._id });
      }
      if (user) await users.deleteOne({ _id: user._id });
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }

    const verificationToken = await this.createOneTimeToken(
      user._id.toString(),
      'verify-email',
    );
    try {
      await this.email.sendVerification(
        user.email,
        user.name,
        verificationToken,
      );
    } catch (error) {
      await this.database.getModel<OneTimeToken>('OneTimeToken').deleteOne({
        tokenHash: tokenHash(verificationToken),
      });
      await this.database
        .getModel<Membership>('Membership')
        .deleteMany({ organizationId: organization._id });
      await this.database
        .getModel('Subscription')
        .deleteOne({ organizationId: organization._id });
      await this.database.getModel<Organization>('Organization').deleteOne({
        _id: organization._id,
      });
      await users.deleteOne({ _id: user._id });
      throw error;
    }
    const session = await this.createSession(
      user,
      organization._id.toString(),
      'ADMIN',
    );
    await this.audit.record({
      organizationId: organization._id.toString(),
      actorId: user._id.toString(),
      action: 'auth.signup',
      targetType: 'user',
      targetId: user._id.toString(),
      metadata: { email: user.email },
    });
    return {
      user: this.publicUser(user),
      organization: {
        id: organization._id.toString(),
        name: organization.name,
      },
      ...session,
      ...(process.env.NODE_ENV !== 'production' ? { verificationToken } : {}),
    };
  }

  async login(email: string, password: string) {
    const user = await this.database
      .getModel<User>('User')
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Verify your email before signing in');
    }
    const membership = await this.database
      .getModel<Membership>('Membership')
      .findOne({ userId: user._id })
      .sort({ createdAt: 1 });
    if (!membership)
      throw new UnauthorizedException('No active organization membership');
    const organization = await this.database
      .getModel<Organization>('Organization')
      .findById(membership.organizationId)
      .select('_id name');
    if (!organization)
      throw new UnauthorizedException('Organization no longer exists');

    await this.audit.record({
      organizationId: organization._id.toString(),
      actorId: user._id.toString(),
      action: 'auth.login',
      targetType: 'user',
      targetId: user._id.toString(),
    });
    return {
      user: this.publicUser(user),
      organization: {
        id: organization._id.toString(),
        name: organization.name,
      },
      ...(await this.createSession(
        user,
        organization._id.toString(),
        membership.role,
      )),
    };
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedException('Refresh session required');
    const sessions = this.database.getModel<RefreshSession>('RefreshSession');
    const session = await sessions
      .findOneAndUpdate(
        {
          tokenHash: tokenHash(rawToken),
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { revokedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .select('+tokenHash');
    if (!session) throw new UnauthorizedException('Refresh session expired');
    const user = await this.database
      .getModel<User>('User')
      .findById(session.userId);
    const membership = await this.database
      .getModel<Membership>('Membership')
      .findOne({ userId: session.userId })
      .sort({ createdAt: 1 });
    if (!user || !membership)
      throw new UnauthorizedException('Account unavailable');
    const organization = await this.database
      .getModel<Organization>('Organization')
      .findById(membership.organizationId)
      .select('_id name');
    if (!organization)
      throw new UnauthorizedException('Organization unavailable');
    return {
      user: this.publicUser(user),
      organization: {
        id: organization._id.toString(),
        name: organization.name,
      },
      ...(await this.createSession(
        user,
        organization._id.toString(),
        membership.role,
      )),
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const session = await this.database
      .getModel<RefreshSession>('RefreshSession')
      .findOneAndUpdate(
        { tokenHash: tokenHash(rawToken), revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { returnDocument: 'after' },
      );
    if (!session) return;
    const memberships = await this.database
      .getModel<Membership>('Membership')
      .find({ userId: session.userId })
      .select('organizationId')
      .lean();
    await Promise.all(
      memberships.map((membership) =>
        this.audit.record({
          organizationId: membership.organizationId.toString(),
          actorId: session.userId.toString(),
          action: 'auth.logout',
          targetType: 'user',
          targetId: session.userId.toString(),
        }),
      ),
    );
  }

  async forgotPassword(email: string) {
    const user = await this.database
      .getModel<User>('User')
      .findOne({ email: email.trim().toLowerCase() });
    if (user) {
      const resetToken = await this.createOneTimeToken(
        user._id.toString(),
        'reset-password',
      );
      try {
        await this.email.sendPasswordReset(user.email, user.name, resetToken);
      } catch (error) {
        await this.database.getModel<OneTimeToken>('OneTimeToken').deleteOne({
          tokenHash: tokenHash(resetToken),
        });
        throw error;
      }
    }
    return {
      message:
        'If an account exists for that email, reset instructions will be sent.',
    };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.consumeOneTimeToken(token, 'reset-password');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.database
      .getModel<User>('User')
      .updateOne({ _id: record.userId }, { passwordHash });
    await this.database
      .getModel<RefreshSession>('RefreshSession')
      .updateMany(
        { userId: record.userId, revokedAt: null },
        { revokedAt: new Date() },
      );
    const memberships = await this.database
      .getModel<Membership>('Membership')
      .find({ userId: record.userId })
      .select('organizationId')
      .lean();
    await Promise.all(
      memberships.map((membership) =>
        this.audit.record({
          organizationId: membership.organizationId.toString(),
          actorId: record.userId.toString(),
          action: 'auth.password_reset',
          targetType: 'user',
          targetId: record.userId.toString(),
        }),
      ),
    );
    return { message: 'Password updated successfully.' };
  }

  async verifyEmail(token: string) {
    const record = await this.consumeOneTimeToken(token, 'verify-email');
    await this.database
      .getModel<User>('User')
      .updateOne({ _id: record.userId }, { emailVerifiedAt: new Date() });
    const memberships = await this.database
      .getModel<Membership>('Membership')
      .find({ userId: record.userId })
      .select('organizationId')
      .lean();
    await Promise.all(
      memberships.map((membership) =>
        this.audit.record({
          organizationId: membership.organizationId.toString(),
          actorId: record.userId.toString(),
          action: 'auth.email_verified',
          targetType: 'user',
          targetId: record.userId.toString(),
        }),
      ),
    );
    return { message: 'Email verified successfully.' };
  }

  async acceptInvitation(token: string, name: string, password: string) {
    const hash = tokenHash(token);
    const invitation = await this.database
      .getModel<Invitation>('Invitation')
      .findOne({
        tokenHash: hash,
        acceptedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .select('+tokenHash');
    if (!invitation)
      throw new UnauthorizedException('Invitation is invalid or expired');

    const users = this.database.getModel<User>('User');
    let user = await users
      .findOne({ email: invitation.email })
      .select('+passwordHash');
    if (user) {
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        throw new UnauthorizedException(
          'This email already has an account; sign in to accept',
        );
      }
    } else {
      user = await users.create({
        email: invitation.email,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        emailVerifiedAt: new Date(),
      });
    }
    await this.database
      .getModel<Membership>('Membership')
      .updateOne(
        { userId: user._id, organizationId: invitation.organizationId },
        { $setOnInsert: { role: invitation.role } },
        { upsert: true },
      );
    const accepted = await this.database
      .getModel<Invitation>('Invitation')
      .findOneAndUpdate(
        {
          _id: invitation._id,
          acceptedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { acceptedAt: new Date() } },
        { returnDocument: 'before' },
      );
    if (!accepted) {
      throw new UnauthorizedException(
        'Invitation is invalid or has already been accepted',
      );
    }
    const organization = await this.database
      .getModel<Organization>('Organization')
      .findById(invitation.organizationId)
      .select('_id name');
    if (!organization)
      throw new UnauthorizedException('Organization unavailable');
    return {
      user: this.publicUser(user),
      organization: {
        id: organization._id.toString(),
        name: organization.name,
      },
      ...(await this.createSession(
        user,
        organization._id.toString(),
        invitation.role,
      )),
    };
  }

  async createInvitation(
    organizationId: string,
    invitedBy: string,
    email: string,
    role: Role,
  ) {
    const existing = await this.database.getModel<User>('User').findOne({
      email: email.trim().toLowerCase(),
    });
    if (
      existing &&
      (await this.database.getModel<Membership>('Membership').exists({
        organizationId,
        userId: existing._id,
      }))
    ) {
      throw new ConflictException(
        'This user is already a member of the organization',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.database
      .getModel<Invitation>('Invitation')
      .findOneAndUpdate(
        { organizationId, email: email.trim().toLowerCase(), acceptedAt: null },
        {
          role,
          invitedBy,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        { upsert: true, returnDocument: 'before', setDefaultsOnInsert: true },
      );
    try {
      await this.email.sendInvitation(email.trim().toLowerCase(), token);
    } catch (error) {
      await this.database.getModel<Invitation>('Invitation').deleteOne({
        _id: invitation?._id,
      });
      throw error;
    }
    return {
      message: 'Invitation created.',
      ...(process.env.NODE_ENV !== 'production'
        ? { invitationToken: token }
        : {}),
    };
  }

  private async createOneTimeToken(userId: string, type: OneTimeToken['type']) {
    const token = randomBytes(32).toString('base64url');
    await this.database.getModel<OneTimeToken>('OneTimeToken').create({
      userId,
      tokenHash: tokenHash(token),
      type,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return token;
  }

  private async consumeOneTimeToken(token: string, type: OneTimeToken['type']) {
    const record = await this.database
      .getModel<OneTimeToken>('OneTimeToken')
      .findOneAndUpdate(
        {
          tokenHash: tokenHash(token),
          type,
          consumedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { consumedAt: new Date() },
        { returnDocument: 'before' },
      )
      .select('+tokenHash');
    if (!record) throw new UnauthorizedException('Token is invalid or expired');
    return record;
  }

  private async createSession(user: User, organizationId: string, role: Role) {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiryDays = Number(process.env.JWT_REFRESH_DAYS ?? 7);
    if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 90) {
      throw new Error('JWT_REFRESH_DAYS must be an integer between 1 and 90');
    }
    await this.database.getModel<RefreshSession>('RefreshSession').create({
      userId: user._id,
      tokenHash: tokenHash(refreshToken),
      expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
    });
    const accessToken = await this.jwtService.signAsync(
      { sub: user._id.toString(), email: user.email },
      { expiresIn: accessTokenExpiry() },
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenExpiry(),
      role,
      organizationId,
    };
  }

  private publicUser(user: User) {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
    };
  }
}
