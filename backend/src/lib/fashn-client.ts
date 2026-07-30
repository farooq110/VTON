import { config } from '../config';
import { logger } from './logger';
import { decryptApiKey } from './crypto';

/**
 * FASHN.ai REST API wrapper — swappable for other VTON providers.
 *
 * Endpoints used:
 *   POST /v1/run   — submit a try-on job
 *   GET  /v1/status/{id} — poll job status
 *
 * All errors are normalized to throw Error objects whose message begins with
 * `FASHN_REJECTED:` (4xx) or `FASHN_ERROR:` (5xx / network).
 */

export interface FashnRunInput {
  model_image: string;
  garment_image: string;
  category?: string;
  mode?: string;
  garment_photo_type?: string;
  num_samples?: number;
  return_base64?: boolean;
}

export interface FashnRunResult {
  id: string;
  status: string;
  output?: string[];
  error?: { name: string; message: string } | null;
  credits_used?: number;
}

export interface FashnStatusResult {
  id: string;
  status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
  output?: string[];
  error?: { name: string; message: string } | null;
}

export interface FashnCreditsResult {
  id: string;
  credits: number;
}

export interface FashnAdapter {
  run(apiKey: string, inputs: FashnRunInput[]): Promise<FashnRunResult>;
  status(apiKey: string, id: string): Promise<FashnStatusResult>;
  credits(apiKey: string): Promise<FashnCreditsResult>;
}

class FashnClient implements FashnAdapter {
  private readonly baseUrl: string;

  constructor(baseUrl: string = config.fashn.baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async run(apiKey: string, inputs: FashnRunInput[]): Promise<FashnRunResult> {
    const url = `${this.baseUrl}/v1/run`;
    const res = await this.doFetch(url, apiKey, {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    });
    return (await this.parse(res)) as unknown as FashnRunResult;
  }

  async status(apiKey: string, id: string): Promise<FashnStatusResult> {
    const url = `${this.baseUrl}/v1/status/${encodeURIComponent(id)}`;
    const res = await this.doFetch(url, apiKey, { method: 'GET' });
    return (await this.parse(res)) as unknown as FashnStatusResult;
  }

  async credits(apiKey: string): Promise<FashnCreditsResult> {
    const url = `${this.baseUrl}/v1/credits`;
    const res = await this.doFetch(url, apiKey, { method: 'GET' });
    return (await this.parse(res)) as unknown as FashnCreditsResult;
  }

  private async doFetch(
    url: string,
    apiKey: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      const msg = (err as Error).message || 'Network error';
      throw new Error(`FASHN_ERROR: network failure — ${msg}`);
    }
  }

  private async parse(res: Response): Promise<Record<string, unknown>> {
    let body: unknown = null;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const errBody = (body as { error?: { name?: string; message?: string } }) || {};
      const errName = errBody.error?.name ?? 'FashnError';
      const errMsg = errBody.error?.message ?? `HTTP ${res.status}`;
      // 4xx → rejected (client's fault — bad key, bad input)
      // 5xx → fashn error (server-side)
      const prefix = res.status >= 400 && res.status < 500 ? 'FASHN_REJECTED' : 'FASHN_ERROR';
      throw new Error(`${prefix}: ${errName} — ${errMsg}`);
    }

    return (body ?? {}) as Record<string, unknown>;
  }
}

export const fashnClient: FashnAdapter = new FashnClient();

/**
 * Convenience helper: run a try-on using the API key stored (encrypted) on an
 * ApiKey row. Decrypts then forwards.
 */
export async function runWithStoredKey(
  encryptedKey: string,
  inputs: FashnRunInput[],
): Promise<FashnRunResult> {
  const apiKey = decryptApiKey(encryptedKey);
  return fashnClient.run(apiKey, inputs);
}

/** Helper to log + rethrow FASHN errors uniformly. */
export function wrapFashnError(err: Error, context: string): Error {
  logger
    .child({ lib: 'fashn-client' })
    .warn({ err: err.message, context }, 'FASHN call failed');
  return err;
}
