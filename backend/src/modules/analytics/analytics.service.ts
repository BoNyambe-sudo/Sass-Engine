import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { Membership, Subscription } from '../database/models.js';

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async getOverview(organizationId: string, from?: string, to?: string) {
    const rangeStart = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 86400_000);
    const rangeEnd = to ? new Date(to) : new Date();
    if (
      Number.isNaN(rangeStart.getTime()) ||
      Number.isNaN(rangeEnd.getTime()) ||
      rangeStart >= rangeEnd ||
      rangeEnd.getTime() - rangeStart.getTime() > 366 * 86400_000
    ) {
      throw new BadRequestException(
        'Date range must be valid and no longer than 366 days',
      );
    }

    const subscriptions = this.database.getModel<Subscription>('Subscription');
    const members = this.database.getModel<Membership>('Membership');
    const scope = { organizationId };
    const [
      revenue,
      activeSubscriptions,
      activeAtStart,
      canceled,
      newUsers,
      series,
    ] = await Promise.all([
      subscriptions.aggregate([
        { $match: { ...scope, status: { $in: ['active', 'trialing'] } } },
        {
          $group: {
            _id: '$currency',
            cents: { $sum: '$amountCents' },
          },
        },
      ]),
      subscriptions.countDocuments({
        ...scope,
        status: { $in: ['active', 'trialing'] },
      }),
      subscriptions.countDocuments({
        ...scope,
        createdAt: { $lt: rangeStart },
        $or: [
          { status: { $in: ['active', 'trialing'] } },
          { canceledAt: { $gte: rangeStart } },
        ],
      }),
      subscriptions.countDocuments({
        ...scope,
        canceledAt: { $gte: rangeStart, $lt: rangeEnd },
      }),
      members.countDocuments({
        ...scope,
        createdAt: { $gte: rangeStart, $lt: rangeEnd },
      }),
      members.aggregate([
        {
          $match: {
            ...scope,
            createdAt: { $gte: rangeStart, $lt: rangeEnd },
          },
        },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: '$createdAt',
                unit: 'month',
                timezone: 'UTC',
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const churn = activeAtStart === 0 ? 0 : (canceled / activeAtStart) * 100;
    const singleCurrency =
      revenue.length === 1
        ? revenue[0]
        : revenue.length === 0
          ? { _id: 'usd', cents: 0 }
          : null;

    return {
      range: { from: rangeStart.toISOString(), to: rangeEnd.toISOString() },
      mrr: singleCurrency ? singleCurrency.cents / 100 : null,
      mrrCurrency: singleCurrency?._id ?? null,
      mrrByCurrency: revenue.map((point) => ({
        currency: point._id,
        amount: point.cents / 100,
      })),
      churn: Number(churn.toFixed(2)),
      activeSubscriptions,
      newUsers,
      series: {
        newUsers: series.map((point) => ({
          date: new Date(point._id).toISOString(),
          value: point.count,
        })),
      },
    };
  }
}
