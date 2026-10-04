import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { OrganizationsController } from './organizations.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [OrganizationsController],
})
export class OrganizationsModule {}
