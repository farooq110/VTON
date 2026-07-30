import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from './logger';

/**
 * Prisma client singleton.
 * All business logic goes through services, never through this directly.
 */
const globalForPrisma = globalThis as unknown as {
  __prismaClient: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: config.isDev ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.__prismaClient ?? createPrismaClient();

if (config.isDev && !globalForPrisma.__prismaClient) {
  globalForPrisma.__prismaClient = prisma;
}

/**
 * Health check helper used by /health endpoint.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    // $queryRaw is supported across providers (sqlite + postgres)
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.child({ lib: 'prisma' }).error(
      { err: (err as Error).message },
      'DB ping failed',
    );
    return false;
  }
}

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
}
