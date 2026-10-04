import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { AccessTokenGuard } from './auth.context.js';

describe('AccessTokenGuard tenant resolution', () => {
  it('denies a valid user token when the selected organization has no membership', async () => {
    const userId = new Types.ObjectId();
    const selectedOrganizationId = new Types.ObjectId().toString();
    const request = {
      headers: {
        authorization: 'Bearer valid-token',
        'x-organization-id': selectedOrganizationId,
      },
    };
    const membershipQuery = {
      lean: vi.fn().mockResolvedValue(null),
    };
    const database = {
      getModel: vi.fn((modelName: string) =>
        modelName === 'User'
          ? {
              findById: () => ({
                select: () => ({
                  lean: async () => ({
                    _id: userId,
                    email: 'member@example.test',
                    emailVerifiedAt: new Date(),
                  }),
                }),
              }),
            }
          : {
              findOne: vi.fn((query: Record<string, unknown>) => {
                expect(query).toMatchObject({
                  userId,
                  organizationId: selectedOrganizationId,
                });
                return membershipQuery;
              }),
            },
      ),
    } as unknown as DatabaseService;
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({ sub: userId.toString() }),
    } as unknown as JwtService;
    const guard = new AccessTokenGuard(jwt, database);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
