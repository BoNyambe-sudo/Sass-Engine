import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import mongoose, { Connection, Model } from 'mongoose';
import { modelSchemas } from './models.js';

type ModelName = keyof typeof modelSchemas;

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private connection?: Connection;
  private readonly models = new Map<ModelName, Model<any>>();

  get isConnected(): boolean {
    return this.connection?.readyState === 1;
  }

  async onModuleInit(): Promise<void> {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is required');
    }

    const options = {
      autoIndex: process.env.NODE_ENV !== 'production',
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 20),
      serverSelectionTimeoutMS: 10_000,
      bufferCommands: false,
      retryWrites: true,
      retryReads: true,
      maxIdleTimeMS: 60_000,
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      this.connection = mongoose.createConnection(uri, options);
      this.connection.on('error', (error) =>
        this.logger.error(
          `MongoDB connection error (attempt ${attempt})`,
          error.stack,
        ),
      );

      try {
        await this.connection.asPromise();
        for (const [name, schema] of Object.entries(modelSchemas) as [
          ModelName,
          (typeof modelSchemas)[ModelName],
        ][]) {
          this.models.set(name, this.connection.model(name, schema));
        }
        this.logger.log('Connected to MongoDB');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `MongoDB connection attempt ${attempt} failed: ${message}`,
        );
        await this.connection.close();
        if (attempt === MAX_RETRIES) {
          throw new ServiceUnavailableException(
            `Failed to connect to MongoDB after ${MAX_RETRIES} attempts`,
          );
        }
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  getModel<T = any>(name: ModelName): Model<T> {
    const model = this.models.get(name);
    if (!model) {
      throw new ServiceUnavailableException('Database is not initialized');
    }
    return model as Model<T>;
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
    this.logger.log('Disconnected from MongoDB');
  }
}
