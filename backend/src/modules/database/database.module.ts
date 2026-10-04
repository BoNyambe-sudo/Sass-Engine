import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { AuditService } from '../audit/audit.service.js';

@Global()
@Module({
  providers: [DatabaseService, AuditService],
  exports: [DatabaseService, AuditService],
})
export class DatabaseModule {}
