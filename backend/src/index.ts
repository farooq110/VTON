import http from 'node:http';
import { config } from './config';
import { createApp } from './app';
import { logger } from './lib/logger';
import { disconnectPrisma } from './lib/prisma';

const app = createApp();
const server = http.createServer(app);

const log = logger.child({ component: 'server' });

server.listen(config.port, () => {
  log.info(
    {
      port: config.port,
      env: config.env,
      corsOrigin: config.cors.origin,
    },
    `Admin Portal backend listening on http://localhost:${config.port}`,
  );
});

// --- Graceful shutdown ---------------------------------------------------- //

function shutdown(signal: string): void {
  log.info({ signal }, 'shutdown signal received, closing server…');
  server.close(async (err) => {
    if (err) {
      log.error({ err: err.message }, 'error closing server');
      process.exit(1);
    }
    await disconnectPrisma();
    log.info('server closed cleanly');
    process.exit(0);
  });

  // Force-exit if graceful shutdown takes too long
  setTimeout(() => {
    log.warn('forcing exit after 10s');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Catch all uncaught errors so the process never silently dies
process.on('uncaughtException', (err) => {
  log.fatal({ err: err.message, stack: err.stack }, 'uncaughtException');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log.fatal({ reason: String(reason) }, 'unhandledRejection');
  process.exit(1);
});
