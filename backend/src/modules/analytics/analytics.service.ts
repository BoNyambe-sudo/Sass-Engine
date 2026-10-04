import { Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsService {
  getOverview() {
    return {
      mrr: 84250,
      churn: 2.4,
      activeSubscriptions: 184,
      newUsers: 36,
      conversionRate: 8.7,
      series: {
        mrr: [12000, 14600, 16800, 19900, 24400, 30200, 36525, 42000],
        users: [18, 22, 30, 24, 36, 41, 34, 52],
      },
    };
  }
}
