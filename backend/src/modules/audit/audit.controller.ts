import { Controller, Get } from '@nestjs/common';

@Controller('audit')
export class AuditController {
  @Get('logs')
  getAuditLogs() {
    return [
      {
        id: 'log_1',
        action: 'user.invited',
        user: 'Maya Chen',
        timestamp: '2026-10-04T10:45:00Z',
      },
      {
        id: 'log_2',
        action: 'subscription.updated',
        user: 'Ari Patel',
        timestamp: '2026-10-04T11:20:00Z',
      },
      {
        id: 'log_3',
        action: 'organization.settings.updated',
        user: 'Maya Chen',
        timestamp: '2026-10-04T12:00:00Z',
      },
    ];
  }
}
