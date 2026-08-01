import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import { useImageValidation } from "@/hooks/useImageValidation";
import { logger } from "@/lib/logger";
import type { Product, SavedCaptureImage } from "@/types";
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
  const { user, brand, trackBrandRequest, setLastResult, addTryOnResult, addSavedImage, setActiveCapture } = useAuthStore();
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
          // Validation failed — discard the pending capture. The image is
          // NOT saved to the gallery (the user's captured photo is dropped).
          sessionStorage.removeItem("nova_pending_capture");
          handlers.onError(result.failureReason ?? "Validation failed. Please retake.");
          return;
        }

        validatedDataUrl = result.validatedDataUrl;
        validatedSizeKb = result.sizeKb;
        logger.tryon("Validation passed", {
          detail: `Size: ${validatedSizeKb.toFixed(0)} KB, score: ${(result.personScore * 100).toFixed(0)}%`,
        });

        // ─── SAVE PENDING CAPTURE (validation passed) ────────────────────
        // If there's a pending capture in sessionStorage (from the camera
        // page's saveAndTryOn), save it to the gallery NOW — validation
        // passed, so the image is eligible for the saved person list.
        // This is the ONLY place the captured image gets saved — if
        // validation fails above, the image is discarded.
        const pendingRaw = sessionStorage.getItem("nova_pending_capture");
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw);
            const saved: SavedCaptureImage = {
              id: `cap_${Date.now()}`,
              dataUrl: pending.dataUrl,
              thumbnailUrl: pending.dataUrl,
              capturedAt: pending.capturedAt ?? Date.now(),
              passedAllStages: true,
              sizeKb: pending.sizeKb ?? validatedSizeKb,
            };
            addSavedImage(saved);
            setActiveCapture(saved.id);
            sessionStorage.removeItem("nova_pending_capture");
            logger.tryon("Pending capture saved to gallery", {
              detail: `Image validated · id ${saved.id}`,
            });
          } catch {
            // Best-effort — if sessionStorage parse fails, continue.
          }
        }
      } else {
        logger.tryon("Validation skipped", { detail: "Using saved image (skipStages=true)", level: "warn" });
      }

      // ─── AI CALL ────────────────────────────────────────────────────────
      handlers.onStageChange("calling-ai", "Generating your look", "TryOn AI is rendering…");
      let resultUrl: string;
      let mockResult = false;
      try {
        const apiResult = await callTryOnApi(validatedDataUrl, product);
        resultUrl = apiResult.resultImage;
        mockResult = apiResult.mock;
        logger.network("TryOn AI call succeeded", {
          detail: mockResult
            ? "Mock result (no customer API key configured)"
            : "Real AI result received",
        });
      } catch (apiErr) {
        // The TryOn AI endpoint returned an error (400/402/502/etc.). Log
        // the error and fall back to a mock result so the user still sees
        // the full flow end-to-end.
        const msg = apiErr instanceof Error ? apiErr.message : "TryOn AI unreachable.";
        logger.network("TryOn AI call failed", { detail: msg, level: "error" });
        handlers.onStageChange("calling-ai", "AI unavailable — using preview", msg.slice(0, 80));
        // Mock result: use the validated captured image so the user sees
        // something on the result screen.
        resultUrl = validatedDataUrl;
        mockResult = true;
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
      logger.tryon("Try-on pipeline complete", {
        detail: `Result saved with id ${result.id}${mockResult ? " (mock)" : ""}`,
      });
      handlers.onResult(resultUrl, brandReq.brandId);
    },
    [addTryOnResult, addSavedImage, setActiveCapture, brand.id, brand.name, handlers, setLastResult, trackBrandRequest, user?.franchiseId, user?.id, validate],
  );

  return { run, modelStatus, modelProgress };
}

/**
 * Calls the BACKEND proxy endpoint `POST /api/tryon/run` which:
 *   1. Resolves the customer from the JWT (or body franchiseId/customerId).
 *   2. Loads the customer's active API key from the database (NOT env var).
 *   3. Forwards the request to FASHN.ai with the decrypted key.
 *   4. Polls FASHN.ai status until the job completes.
 *   5. Returns `{ success: true, data: { resultImage, mock, provider } }`.
 *
 * Uses the shared `apiClient` (axios) instance so:
 *   - The request goes to the BACKEND (http://localhost:4000/api/tryon/run),
 *     NOT the Vite dev server (which was the cause of the original HTTP 404).
 *   - The Authorization header is auto-injected from localStorage.
 *   - 401 responses are handled centrally by the api-client interceptor.
 *
 * If no customer API key is configured in the database, the backend returns
 * a MOCK result (the user's own image) with `mock: true` — the pipeline
 * still completes end-to-end.
 */
async function callTryOnApi(
  capturedDataUrl: string,
  product: Product,
): Promise<{ resultImage: string; mock: boolean; provider: string }> {
  logger.network("Calling TryOn AI via backend proxy", {
    detail: `POST /api/tryon/run · ${product.sku}`,
  });

  // Read the current user from the store to pass franchiseId/customerId.
  // This lets the backend resolve which customer's API key to use.
  const storeState = useAuthStore.getState();
  const user = storeState.user;

  let res;
  try {
    res = await apiClient.post("/tryon/run", {
      userImage: capturedDataUrl,
      productSku: product.sku,
      productName: product.name,
      productCategory: product.category,
      garmentImage: product.garmentOverlayUrl || undefined,
      franchiseId: user?.franchiseId,
      customerId: undefined, // let the backend resolve via franchise / fallback
    });
  } catch (apiErr: unknown) {
    // axios errors expose the response body via .response.data
    const axiosErr = apiErr as { response?: { data?: { message?: string; error?: { message?: string } }; status?: number } };
    const detail =
      axiosErr.response?.data?.error?.message ??
      axiosErr.response?.data?.message ??
      (apiErr instanceof Error ? apiErr.message : "Network error");
    const status = axiosErr.response?.status ?? 0;
    throw new Error(`TryOn AI call failed: HTTP ${status} — ${detail}`);
  }

  const body = res.data;
  const data = body?.data ?? body;
  const resultImage: string | undefined =
    data?.resultImage ?? data?.result_image ?? data?.url;
  if (!resultImage) {
    throw new Error("Backend response missing resultImage field.");
  }
  return {
    resultImage,
    mock: data?.mock === true,
    provider: data?.provider ?? "fashn",
  };
}
