import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Types } from 'mongoose';
import { DatabaseService } from '../database/database.service.js';
import { Membership, Role, User } from '../database/models.js';

export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) {
      throw new UnauthorizedException();
    }
    return auth;
  },
);

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: { sub?: string; email?: string };
    try {
      payload = await this.jwt.verifyAsync(authorization.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.database
      .getModel<User>('User')
      .findById(payload.sub)
      .select('_id email emailVerifiedAt')
      .lean();
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Verify your email before using this workspace',
      );
    }

    const requestedOrganization = request.headers['x-organization-id'];
    const membershipQuery: Record<string, unknown> = {
      userId: user._id,
    };
    if (typeof requestedOrganization === 'string') {
      if (!Types.ObjectId.isValid(requestedOrganization)) {
        throw new ForbiddenException('Invalid organization');
      }
      membershipQuery.organizationId = requestedOrganization;
    }
    const membership = await this.database
      .getModel<Membership>('Membership')
      .findOne(membershipQuery)
      .lean();
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    request.auth = {
      userId: user._id.toString(),
      email: user.email,
      organizationId: membership.organizationId.toString(),
      role: membership.role,
    };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth || !roles.includes(request.auth.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    return true;
  }
}
