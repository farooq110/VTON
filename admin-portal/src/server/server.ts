/**
 * SSR server stub.
 *
 * The admin portal is a SPA in this build, so SSR is not used. This file
 * exists as a placeholder + extension point: drop in an Express (or any)
 * middleware here to render the app on the server if you later want SSR.
 *
 * Kept framework-agnostic — no Express dependency required at runtime.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export interface SsrContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: string;
}

export async function renderToString(_ctx: SsrContext): Promise<string> {
  // TODO: implement SSR (e.g. renderToPipeableStream) when needed.
  return "<!-- SSR not enabled — this SPA runs client-side. -->";
}

export const ssrEnabled = false;
