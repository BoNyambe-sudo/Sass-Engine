import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AuditLog } from '../database/models.js';

export interface AuditEntry {
  organizationId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.database.getModel<AuditLog>('AuditLog').create({
      ...entry,
      targetId: entry.targetId ?? null,
      metadata: this.redact(entry.metadata ?? {}),
    });
  }

  private redact(metadata: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata)
        .filter(
          ([key]) => !/(password|token|secret|authorization|cookie)/i.test(key),
        )
        .map(([key, value]) => [
          key,
          key.toLowerCase() === 'email' && typeof value === 'string'
            ? value.replace(/^(.).+(@.+)$/, '$1***$2')
            : value,
        ]),
    );
  }
}
