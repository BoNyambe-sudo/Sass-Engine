import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseService } from './modules/database/database.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DatabaseService, useValue: { isConnected: true } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return service status payload', () => {
      expect(appController.getHealth()).toMatchObject({
        ok: true,
        service: 'saas-growth-engine-api',
      });
    });
  });
});
