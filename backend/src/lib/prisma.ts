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
 *
 * Detects the active Prisma provider from the datasource URL and runs the
 * appropriate ping command:
 *   - MongoDB (URL starts with `mongo`) → `$runCommandRaw({ ping: 1 })`
 *   - SQL providers (sqlite/postgres/mysql) → `$queryRaw\`SELECT 1\``
 *
 * Falls back to a no-op OK if the provider can't be detected, so the health
 * endpoint never 500s during cold starts.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    const url = config.db.url || '';
    const isMongo = /^mongo(db\+srv)?:\/\//i.test(url);
    const p = prisma as unknown as {
      $runCommandRaw?: (cmd: Record<string, unknown>) => Promise<unknown>;
      $queryRaw?: (strings: TemplateStringsArray) => Promise<unknown>;
    };
    if (isMongo && typeof p.$runCommandRaw === "function") {
      await p.$runCommandRaw({ ping: 1 });
    } else if (!isMongo && typeof p.$queryRaw === "function") {
      await p.$queryRaw`SELECT 1`;
    } else {
      // No provider-specific ping available — assume ok.
    }
    return true;
  } catch (err) {
    logger.child({ lib: "prisma" }).error(
      { err: (err as Error).message },
      "DB ping failed",
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
