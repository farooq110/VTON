import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { CreateNotificationInput } from '../schemas/notification.schema';

/**
 * Notification service — swappable business logic.
 */

const svcLogger = logger.child({ service: 'notification' });

export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ id: string }> {
  try {
    const row = await prisma.notification.create({
      data: {
        customerId: input.customerId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        severity: input.severity,
      },
    });
    return { id: row.id };
  } catch (err) {
    svcLogger.error({ err: (err as Error).message }, 'createNotification failed');
    throw err;
  }
}

export interface ListNotificationsParams {
  customerId?: string;
  unreadOnly?: boolean;
  page: number;
  pageSize: number;
}

export async function listNotifications(params: ListNotificationsParams) {
  const where: Record<string, unknown> = {};
  if (params.customerId) where.customerId = params.customerId;
  if (params.unreadOnly) where.read = false;

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function markRead(id: string): Promise<void> {
  await prisma.notification.update({
    where: { id },
    data: { read: true },
  });
}

export async function markAllRead(customerId?: string): Promise<{ count: number }> {
  const where: Record<string, unknown> = { read: false };
  if (customerId) where.customerId = customerId;
  const result = await prisma.notification.updateMany({
    where,
    data: { read: true },
  });
  return { count: result.count };
}

export async function getUnreadCount(customerId?: string): Promise<number> {
  const where: Record<string, unknown> = { read: false };
  if (customerId) where.customerId = customerId;
  return prisma.notification.count({ where });
}
