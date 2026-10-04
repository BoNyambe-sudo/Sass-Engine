import {
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Injectable,
} from '@nestjs/common';

import { db } from './db.js';

@Injectable()
export class PrismaService {
  public readonly client = db;
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.client.connect();
      this.logger.log('Connected to database');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.client.close();
    this.logger.log('Disconnected from database');
  }
}