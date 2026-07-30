import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const svcLogger = logger.child({ service: 'activity' });

export interface ActivitySummary {
  totals: {
    customers: number;
    activeCustomers: number;
    franchises: number;
    apiKeys: number;
    activeApiKeys: number;
    vtonRequests: number;
    completedVtonRequests: number;
    pendingVtonRequests: number;
    failedVtonRequests: number;
    invoices: number;
    draftInvoices: number;
    sentInvoices: number;
    usageRecords: number;
    totalCreditsUsed: number;
  };
  byDay: Array<{ day: string; count: number; credits: number }>;
  byCustomer: Array<{
    customerId: string;
    customerName: string;
    businessName: string;
    count: number;
    credits: number;
  }>;
  byStatus: Array<{ status: string; count: number }>;
  last24h: {
    vtonRequests: number;
    usageRecords: number;
    completedVtonRequests: number;
    failedVtonRequests: number;
  };
}

export async function getActivitySummary(): Promise<ActivitySummary> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    customers,
    activeCustomers,
    franchises,
    apiKeys,
    activeApiKeys,
    vtonRequests,
    vtonByStatus,
    invoices,
    invoicesByStatus,
    usageAgg,
    last24hVton,
    last24hUsage,
    last24hCompleted,
    last24hFailed,
    usageByDayRaw,
    usageByCustomerRaw,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.franchise.count(),
    prisma.apiKey.count(),
    prisma.apiKey.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.vtonRequest.count(),
    prisma.vtonRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.invoice.count(),
    prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.usage.aggregate({ _sum: { creditsUsed: true }, _count: { _all: true } }),
    prisma.vtonRequest.count({ where: { createdAt: { gte: since24h } } }),
    prisma.usage.count({ where: { createdAt: { gte: since24h } } }),
    prisma.vtonRequest.count({
      where: { createdAt: { gte: since24h }, status: 'completed' },
    }),
    prisma.vtonRequest.count({
      where: { createdAt: { gte: since24h }, status: 'failed' },
    }),
    prisma.usage.findMany({
      where: { day: { gte: last30d } },
      select: { day: true, creditsUsed: true },
    }),
    prisma.usage.findMany({
      where: {},
      select: {
        customerId: true,
        customer: { select: { name: true, businessName: true } },
        creditsUsed: true,
      },
    }),
  ]);

  // Aggregate usage by day (last 30d)
  const byDayMap = new Map<string, { count: number; credits: number }>();
  for (const u of usageByDayRaw) {
    const key = u.day.toISOString().slice(0, 10);
    const cur = byDayMap.get(key) ?? { count: 0, credits: 0 };
    cur.count += 1;
    cur.credits += u.creditsUsed;
    byDayMap.set(key, cur);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Aggregate usage by customer
  const byCustomerMap = new Map<
    string,
    { customerName: string; businessName: string; count: number; credits: number }
  >();
  for (const u of usageByCustomerRaw) {
    const cur =
      byCustomerMap.get(u.customerId) ?? {
        customerName: u.customer.name,
        businessName: u.customer.businessName,
        count: 0,
        credits: 0,
      };
    cur.count += 1;
    cur.credits += u.creditsUsed;
    byCustomerMap.set(u.customerId, cur);
  }
  const byCustomer = Array.from(byCustomerMap.entries())
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => b.credits - a.credits)
    .slice(0, 20);

  const vtonByStatusMap = Object.fromEntries(
    vtonByStatus.map((s) => [s.status, s._count._all]),
  );
  const invoicesByStatusMap = Object.fromEntries(
    invoicesByStatus.map((s) => [s.status, s._count._all]),
  );

  svcLogger.debug(
    {
      customers,
      vtonRequests,
      usageRecords: usageAgg._count._all,
    },
    'activity summary computed',
  );

  return {
    totals: {
      customers,
      activeCustomers,
      franchises,
      apiKeys,
      activeApiKeys,
      vtonRequests,
      completedVtonRequests: vtonByStatusMap.completed ?? 0,
      pendingVtonRequests:
        (vtonByStatusMap.pending ?? 0) + (vtonByStatusMap.processing ?? 0),
      failedVtonRequests: vtonByStatusMap.failed ?? 0,
      invoices,
      draftInvoices: invoicesByStatusMap.DRAFT ?? 0,
      sentInvoices: invoicesByStatusMap.SENT ?? 0,
      usageRecords: usageAgg._count._all,
      totalCreditsUsed: usageAgg._sum.creditsUsed ?? 0,
    },
    byDay,
    byCustomer,
    byStatus: vtonByStatus.map((s) => ({ status: s.status, count: s._count._all })),
    last24h: {
      vtonRequests: last24hVton,
      usageRecords: last24hUsage,
      completedVtonRequests: last24hCompleted,
      failedVtonRequests: last24hFailed,
    },
  };
}

export interface PeakTimesResult {
  byHour: Array<{ hour: number; count: number; credits: number }>;
  byDayOfWeek: Array<{ dayOfWeek: number; dayName: string; count: number }>;
  peakHour: { hour: number; count: number } | null;
  peakDayOfWeek: { dayOfWeek: number; dayName: string; count: number } | null;
  window: { since: string };
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export async function getPeakTimes(daysBack = 30): Promise<PeakTimesResult> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const usages = await prisma.usage.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, creditsUsed: true },
  });

  const byHour = new Array(24).fill(0).map((_, hour) => ({
    hour,
    count: 0,
    credits: 0,
  }));
  const byDayOfWeek = new Array(7).fill(0).map((_, dayOfWeek) => ({
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek],
    count: 0,
  }));

  for (const u of usages) {
    const hour = u.createdAt.getUTCHours();
    const dow = u.createdAt.getUTCDay();
    byHour[hour].count += 1;
    byHour[hour].credits += u.creditsUsed;
    byDayOfWeek[dow].count += 1;
  }

  const peakHour = byHour.reduce(
    (best, cur) => (cur.count > best.count ? cur : best),
    { hour: 0, count: 0 },
  );
  const peakDayOfWeek = byDayOfWeek.reduce(
    (best, cur) => (cur.count > best.count ? cur : best),
    { dayOfWeek: 0, dayName: 'Sunday', count: 0 },
  );

  return {
    byHour,
    byDayOfWeek,
    peakHour: peakHour.count > 0 ? peakHour : null,
    peakDayOfWeek: peakDayOfWeek.count > 0 ? peakDayOfWeek : null,
    window: { since: since.toISOString() },
  };
}
