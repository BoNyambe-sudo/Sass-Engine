import { Injectable } from '@nestjs/common';
import { DatabaseService } from './modules/database/database.service.js';

@Injectable()
export class AppService {
  constructor(private readonly database: DatabaseService) {}

  getHealth() {
    return {
      ok: this.database.isConnected,
      service: 'saas-growth-engine-api',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'development',
      database: this.database.isConnected ? 'connected' : 'disconnected',
    };
  }
}
