import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * JWT adapter — swappable.
 * All services call sign()/verify() through this module.
 */

export interface JwtPayload {
  sub: string; // admin id
  email: string;
  role: string;
  [key: string]: unknown;
}

export interface JwtAdapter {
  sign(payload: JwtPayload): string;
  verify(token: string): JwtPayload;
}

class JwtAdapterImpl implements JwtAdapter {
  sign(payload: JwtPayload): string {
    return jwt.sign(payload, config.auth.jwtSecret, {
      // jsonwebtoken's newer types want a branded StringValue; our env gives a
      // plain string like "7d". Cast to satisfy TS without changing runtime.
      expiresIn: config.auth.jwtExpiresIn as unknown as number,
    });
  }

  verify(token: string): JwtPayload {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as jwt.JwtPayload;
    return {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      ...decoded,
    } as JwtPayload;
  }
}

export const jwtAdapter: JwtAdapter = new JwtAdapterImpl();

/** Express-friendly helpers used by auth.middleware.ts */
export function signToken(payload: JwtPayload): string {
  return jwtAdapter.sign(payload);
}

export function verifyToken(token: string): JwtPayload {
  return jwtAdapter.verify(token);
}
