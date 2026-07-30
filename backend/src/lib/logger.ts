import { config } from '../config';
import pino, { type Logger } from 'pino';

/**
 * Pino logger.
 * - dev: pino-pretty (colorized, human-readable)
 * - prod/test: JSON to stdout
 */
const baseConfig = {
  level: config.log.level,
  base: { service: 'admin-portal-backend' },
} as const;

export const logger: Logger = config.isDev
  ? pino({
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    })
  : pino(baseConfig);

export { Logger };
