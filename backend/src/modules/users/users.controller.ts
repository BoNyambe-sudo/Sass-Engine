import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  CurrentAuth,
  Roles,
  RolesGuard,
} from '../auth/auth.context.js';
import type { AuthContext } from '../auth/auth.context.js';
import { ChangeRoleDto, InviteDto } from '../auth/auth.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(AccessTokenGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async getUsers(
    @CurrentAuth() auth: AuthContext,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.users.getUsers(auth.organizationId, page, limit);
  }

  @Get('invitations')
  @Roles('ADMIN', 'MANAGER')
  async getInvitations(@CurrentAuth() auth: AuthContext) {
    return this.users.getInvitations(auth.organizationId);
  }

  @Delete('invitations/:invitationId')
  @Roles('ADMIN', 'MANAGER')
  async revokeInvitation(
    @CurrentAuth() auth: AuthContext,
    @Param('invitationId') invitationId: string,
  ) {
    return this.users.revokeInvitation(auth, invitationId);
  }

  @Post('invitations')
  @Roles('ADMIN', 'MANAGER')
  async invite(@CurrentAuth() auth: AuthContext, @Body() dto: InviteDto) {
    return this.users.invite(auth, dto.email, dto.role);
  }

  @Patch(':userId/role')
  @Roles('ADMIN')
  async changeRole(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.users.changeRole(auth, userId, dto);
  }

  @Delete(':userId')
  @Roles('ADMIN')
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('userId') userId: string,
  ) {
    return this.users.remove(auth, userId);
  }
}
