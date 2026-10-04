import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    const health = this.appService.getHealth();
    if (!health.ok) {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }
}
