import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

/**
 * Pino HTTP middleware — logs every request with method, url, statusCode,
 * response time, and ip. Uses the shared logger.
 *
 * Note: pino-http's `req` parameter is typed as Node's IncomingMessage, but
 * Express augments it with `originalUrl`. We cast to a minimal helper type to
 * access both fields safely.
 */
interface LoggedReq {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  remoteAddress?: string;
}

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    const r = req as unknown as LoggedReq;
    return `${r.method} ${r.originalUrl ?? r.url} → ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    const r = req as unknown as LoggedReq;
    return `${r.method} ${r.originalUrl ?? r.url} → ${res.statusCode} ${err.message}`;
  },
  serializers: {
    req(req) {
      const r = req as unknown as LoggedReq;
      return {
        method: r.method,
        url: r.originalUrl ?? r.url,
        headers: { 'user-agent': r.headers['user-agent'] },
        remoteAddress: r.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
  autoLogging: {
    ignore: (req) => {
      const r = req as unknown as LoggedReq;
      const url = r.originalUrl ?? r.url ?? '';
      return url.startsWith('/health');
    },
  },
});
