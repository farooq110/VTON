import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { logger } from './lib/logger';
import { requestLogger } from './middleware/request-logger.middleware';
import { globalRateLimit } from './middleware/rate-limit.middleware';
import { notFoundHandler } from './middleware/not-found.middleware';
import { errorHandler } from './middleware/error.middleware';

import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import customersRoutes from './routes/customers.routes';
import franchisesRoutes from './routes/franchises.routes';
import usageRoutes from './routes/usage.routes';
import pricingRoutes from './routes/pricing.routes';
import invoiceRoutes from './routes/invoices.routes';
import vtonRoutes from './routes/vton.routes';
import notificationRoutes from './routes/notifications.routes';
import activityRoutes from './routes/activity.routes';

export function createApp(): Express {
  const app = express();

  // Trust proxy (so req.ip + secure cookies work behind Caddy/Nginx)
  app.set('trust proxy', 1);

  // --- Security & parsing middleware (order matters) ---
  app.use(helmet());
  app.use(
    cors({
      origin: config.cors.origin.split(',').map((s) => s.trim()),
      credentials: true, // required for cookie-based auth cross-origin
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // --- Request logging (before routes so every request is logged) ---
  app.use(requestLogger);

  // --- Global rate limiter (applied to /api/* only) ---
  app.use('/api', globalRateLimit);

  // --- Health (no auth, no rate limit beyond the global one) ---
  app.use('/health', healthRoutes);

  // --- API routes (all mounted under /api) ---
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/franchises', franchisesRoutes);
  app.use('/api/usage', usageRoutes);
  app.use('/api/pricing', pricingRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/vton', vtonRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/activity', activityRoutes);

  // --- 404 + centralized error handler (LAST) ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
