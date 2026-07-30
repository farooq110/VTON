/**
 * Loosely-coupled API client.
 *
 * Wraps `fetch` so we can swap implementations (axios, ky, etc.) by editing
 * only this file. Every page/hook should import from here rather than calling
 * `fetch` directly.
 */
import { API_URL } from "@/shared/constants";
import type { PaginatedResult } from "@/shared/types";

const SIGNIN_PATH = "/signin";

interface RequestOptions {
  signal?: AbortSignal;
}

async function apiRequest<T>(
  method: string,
  url: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${url}`, {
      method,
      credentials: "include", // send HttpOnly auth cookie
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts?.signal,
    });
  } catch (networkErr) {
    // Network/CORS error — common when backend is down.
    throw new Error(
      extractApiError(networkErr) ||
        "Network error — could not reach the API server.",
    );
  }

  // 401 → bounce to /signin (cookie expired / not logged in).
  if (res.status === 401) {
    if (
      typeof window !== "undefined" &&
      !window.location.hash.includes(SIGNIN_PATH)
    ) {
      window.location.hash = `#${SIGNIN_PATH}`;
    }
    const msg = await safeErrorMessage(res);
    throw new Error(msg || "Unauthorized");
  }

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
    message?: string;
  };

  if (!res.ok || json.success === false) {
    throw new Error(
      json?.error?.message || json?.message || `HTTP ${res.status}`,
    );
  }

  return (json.data ?? ({} as T)) as T;
}

async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json().catch(() => ({}));
    return json?.error?.message || json?.message || "";
  } catch {
    return "";
  }
}

/** Pull a human-readable message out of any error shape. */
export function extractApiError(e: unknown): string {
  if (!e) return "";
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const any = e as Record<string, unknown>;
    if (typeof any.message === "string") return any.message;
    if (any.error && typeof any.error === "object") {
      const err = any.error as Record<string, unknown>;
      if (typeof err.message === "string") return err.message;
    }
  }
  return "Something went wrong";
}

export const apiGet = <T>(url: string, opts?: RequestOptions) =>
  apiRequest<T>("GET", url, undefined, opts);

export const apiPost = <T>(url: string, body?: unknown, opts?: RequestOptions) =>
  apiRequest<T>("POST", url, body, opts);

export const apiPut = <T>(url: string, body?: unknown, opts?: RequestOptions) =>
  apiRequest<T>("PUT", url, body, opts);

export const apiDelete = <T>(url: string, opts?: RequestOptions) =>
  apiRequest<T>("DELETE", url, undefined, opts);

/** Convenience for paginated endpoints that return PaginatedResult<T>. */
export const apiGetPaginated = <T>(url: string, opts?: RequestOptions) =>
  apiRequest<PaginatedResult<T>>("GET", url, undefined, opts);
