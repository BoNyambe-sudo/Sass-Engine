import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UsersController],
})
export class UsersModule {}
