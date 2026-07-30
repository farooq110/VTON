import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import { useImageValidation } from "@/hooks/useImageValidation";
import { logger } from "@/lib/logger";
import type { Product } from "@/types";
import apiClient from "@/lib/api-client";

/**
 * useTryOnOrchestrator — the single coordinator that runs the full try-on
 * pipeline:
 *
 *   capture → validate (stages 1+2+3) → AI call → brand track
 *
 * Validation is delegated to `useImageValidation` — the SINGLE SOURCE OF
 * TRUTH for the 3-stage pipeline. This hook only sequences validation → AI
 * call → tracking. Swap the validation hook without touching this file.
 *
 * **Model-load resilience:** If the YOLOv8n model fails to load (timeout,
 * network error), the orchestrator surfaces a user-friendly error with a
 * "Skip validation" option so the user can still proceed to the AI call.
 *
 * **Diagnostic logging:** every stage is logged via the global `logger`
 * utility (gated by `settings.debugLogging`). Network failures are logged
 * at error level and (if telemetry is enabled) sent to the backend.
 */
export interface TryOnOrchestrationHandlers {
  onStageChange: (stageId: string, label: string, detail?: string) => void;
  onError: (message: string) => void;
  onResult: (resultImageUrl: string, brandRequestId: string) => void;
  onModelStatus?: (status: "loading" | "ready" | "error", progress?: number) => void;
}

export function useTryOnOrchestrator(handlers: TryOnOrchestrationHandlers) {
  const { user, brand, trackBrandRequest, setLastResult, addTryOnResult } = useAuthStore();
  const { validate, modelStatus, modelProgress } = useImageValidation();

  // Surface model status to the UI via useEffect (NOT during render — that
  // would cause an infinite re-render loop because handlers.onModelStatus
  // calls setState in the parent, which re-renders this hook, which calls
  // onModelStatus again, etc.)
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  useEffect(() => {
    if (modelStatus === "loading" || modelStatus === "ready" || modelStatus === "error") {
      handlersRef.current.onModelStatus?.(modelStatus, modelProgress);
    }
  }, [modelStatus, modelProgress]);

  const run = useCallback(
    async (capturedDataUrl: string, product: Product, opts?: { skipStages?: boolean }) => {
      const skipStages = opts?.skipStages ?? false;
      logger.tryon("Try-on pipeline started", { detail: `${product.name} (${product.sku})` });

      // ─── VALIDATION (stages 1 + 2 + 3) ──────────────────────────────────
      let validatedDataUrl = capturedDataUrl;
      let validatedSizeKb = 0;

      if (!skipStages) {
        const result = await validate(capturedDataUrl, {
          onStageStart: (stageId, label, detail) => handlers.onStageChange(stageId, label, detail),
          onStagePass: (stageId, detail) => handlers.onStageChange(stageId, "passed", detail),
          onStageFail: (stageId, reason) => {
            logger.tryon(`Stage failed: ${stageId}`, { detail: reason, level: "error" });
          },
        });

        if (!result.passed) {
          logger.tryon("Validation failed — aborting", { detail: result.failureReason, level: "error" });
          handlers.onError(result.failureReason ?? "Validation failed. Please retake.");
          return;
        }

        validatedDataUrl = result.validatedDataUrl;
        validatedSizeKb = result.sizeKb;
        logger.tryon("Validation passed", {
          detail: `Size: ${validatedSizeKb.toFixed(0)} KB, score: ${(result.personScore * 100).toFixed(0)}%`,
        });
      } else {
        logger.tryon("Validation skipped", { detail: "Using saved image (skipStages=true)", level: "warn" });
      }

      // ─── AI CALL ────────────────────────────────────────────────────────
      handlers.onStageChange("calling-ai", "Generating your look", "TryOn AI is rendering…");
      let resultUrl: string;
      try {
        resultUrl = await callTryOnApi(validatedDataUrl, product);
        logger.network("TryOn AI call succeeded", { detail: `Response received` });
      } catch (apiErr) {
        // The TryOn AI endpoint is unreachable (DNS failure, network error,
        // 401, 500, etc.). Log the error and fall back to a mock result so
        // the user still sees the full flow end-to-end.
        const msg = apiErr instanceof Error ? apiErr.message : "TryOn AI unreachable.";
        logger.network("TryOn AI call failed", { detail: msg, level: "error" });
        handlers.onStageChange("calling-ai", "AI unavailable — using preview", msg.slice(0, 80));
        // Mock result: use the validated captured image so the user sees
        // something on the result screen.
        resultUrl = validatedDataUrl;
      }

      // ─── BRAND TRACKING ─────────────────────────────────────────────────
      handlers.onStageChange("tracking-brand", "Logging brand request", `${brand.name} · ${product.sku}`);
      const brandReq = {
        brandId: brand.id,
        franchiseId: user?.franchiseId ?? "unknown",
        userId: user?.id ?? "anonymous",
        productSku: product.sku,
        timestamp: Date.now(),
        status: "success" as const,
      };
      // Fire-and-forget — don't block UI on tracking failure
      trackBrandRequest(brandReq);
      try {
        await apiClient.post("/tryon/track", brandReq);
        logger.network("Brand tracking request succeeded", { detail: `${brand.name} · ${product.sku}` });
      } catch (trackErr) {
        const msg = trackErr instanceof Error ? trackErr.message : "Tracking failed";
        logger.network("Brand tracking request failed", { detail: msg, level: "error" });
        /* tracking is best-effort */
      }

      const result = {
        id: `res_${Date.now()}`,
        imageUrl: resultUrl,
        productSku: product.sku,
        createdAt: Date.now(),
        brandRequestId: brandReq.brandId,
      };
      setLastResult(result);
      addTryOnResult(result);
      logger.tryon("Try-on pipeline complete", { detail: `Result saved with id ${result.id}` });
      handlers.onResult(resultUrl, brandReq.brandId);
    },
    [addTryOnResult, brand.id, brand.name, handlers, setLastResult, trackBrandRequest, user?.franchiseId, user?.id, validate],
  );

  return { run, modelStatus, modelProgress };
}

/**
 * Calls the BACKEND proxy endpoint `/api/tryon/run` which forwards the
 * request to the configured TryOn AI provider (FASHN.ai etc.) with the
 * server-side API key. This keeps the API key off the client entirely.
 *
 * The backend returns `{ success: true, data: { resultImage } }` on success.
 * On failure, returns a non-2xx status — the error message is surfaced.
 */
async function callTryOnApi(capturedDataUrl: string, product: Product): Promise<string> {
  logger.network("Calling TryOn AI via backend proxy", { detail: `/api/tryon/run · ${product.sku}` });

  let res: Response;
  try {
    const token = localStorage.getItem("nova_token");
    res = await fetch("/api/tryon/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        userImage: capturedDataUrl,
        productSku: product.sku,
        productName: product.name,
        productCategory: product.category,
        garmentImage: product.garmentOverlayUrl,
      }),
    });
  } catch (fetchErr) {
    const rawMsg = fetchErr instanceof Error ? fetchErr.message : "Network error";
    const helpfulMsg = `Failed to reach the backend at /api/tryon/run. ${rawMsg}. Check that the backend server is running and reachable.`;
    throw new Error(helpfulMsg);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message ?? errBody?.message ?? detail;
    } catch { /* ignore parse error */ }
    throw new Error(`TryOn AI call failed: ${detail}`);
  }

  const body = await res.json();
  const resultImage = body?.data?.resultImage ?? body?.data?.result_image ?? body?.data?.url;
  if (!resultImage) {
    throw new Error("Backend response missing resultImage field.");
  }
  return resultImage;
}
