import { useCallback, useEffect, useReducer, useRef } from "react";
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
 * ─── Issue 6 fix — explicit state machine ──────────────────────────────
 * The previous implementation relied on multiple disconnected booleans
 * (`isCapturing`, `isProcessing`, `isPoseValid`) scattered across the
 * consumer component. That made it easy to enter impossible combinations
 * (e.g. `isCapturing && isProcessing` both true) and caused race-condition
 * bugs.
 *
 * The orchestrator now exposes a single discriminated-union `state`:
 *
 *   type TryOnState =
 *     | { status: "IDLE" }
 *     | { status: "CAMERA_INITIALIZING" }
 *     | { status: "POSE_ALIGNING" }
 *     | { status: "CAPTURING" }
 *     | { status: "PROCESSING"; progress: number }
 *     | { status: "COMPLETED"; resultUrl: string }
 *     | { status: "ERROR"; message: string };
 *
 * Only ONE of these statuses can be active at any time — the union makes
 * impossible states unrepresentable. Consumers render UI based on
 * `state.status` instead of juggling booleans.
 *
 * The `run` function still accepts the same handlers for backward
 * compatibility, but the canonical way to observe state is via the
 * returned `state` object.
 *
 * **Diagnostic logging:** every state transition is logged via the global
 * `logger` utility (gated by `settings.debugLogging`).
 */

// ─── State machine definition ────────────────────────────────────────── //
export type TryOnState =
  | { status: "IDLE" }
  | { status: "CAMERA_INITIALIZING" }
  | { status: "POSE_ALIGNING" }
  | { status: "CAPTURING" }
  | { status: "PROCESSING"; progress: number }
  | { status: "COMPLETED"; resultUrl: string }
  | { status: "ERROR"; message: string };

type TryOnAction =
  | { type: "START_CAMERA" }
  | { type: "POSE_ALIGN" }
  | { type: "CAPTURE" }
  | { type: "PROCESS"; progress?: number }
  | { type: "COMPLETE"; resultUrl: string }
  | { type: "FAIL"; message: string }
  | { type: "RESET" };

function tryOnReducer(state: TryOnState, action: TryOnAction): TryOnState {
  switch (action.type) {
    case "START_CAMERA":
      return { status: "CAMERA_INITIALIZING" };
    case "POSE_ALIGN":
      return { status: "POSE_ALIGNING" };
    case "CAPTURE":
      return { status: "CAPTURING" };
    case "PROCESS":
      return { status: "PROCESSING", progress: action.progress ?? 0 };
    case "COMPLETE":
      return { status: "COMPLETED", resultUrl: action.resultUrl };
    case "FAIL":
      return { status: "ERROR", message: action.message };
    case "RESET":
      return { status: "IDLE" };
    default:
      return state;
  }
}

// ─── Backward-compatible handler interface ───────────────────────────── //
export interface TryOnOrchestrationHandlers {
  onStageChange: (stageId: string, label: string, detail?: string) => void;
  onError: (message: string) => void;
  onResult: (resultImageUrl: string, brandRequestId: string) => void;
  onModelStatus?: (status: "loading" | "ready" | "error", progress?: number) => void;
}

export function useTryOnOrchestrator(handlers: TryOnOrchestrationHandlers) {
  const { user, brand, trackBrandRequest, setLastResult, addTryOnResult, addSavedImage, setActiveCapture } = useAuthStore();
  const { validate, modelStatus, modelProgress } = useImageValidation();

  // ─── Issue 6: single state machine replaces disconnected booleans ───
  const [state, dispatch] = useReducer(tryOnReducer, { status: "IDLE" });

  // Log every state transition so the activity panel shows the full flow.
  useEffect(() => {
    logger.tryon(`State → ${state.status}`, {
      detail:
        state.status === "PROCESSING" ? `${state.progress}%` :
        state.status === "COMPLETED" ? state.resultUrl.slice(0, 60) :
        state.status === "ERROR" ? state.message :
        undefined,
    });
  }, [state]);

  // Surface model status to the UI via useEffect (NOT during render).
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
      dispatch({ type: "POSE_ALIGN" });
      let validatedDataUrl = capturedDataUrl;
      let validatedSizeKb = 0;

      if (!skipStages) {
        const result = await validate(capturedDataUrl, {
          onStageStart: (stageId, label, detail) => {
            dispatch({ type: "PROCESS", progress: 25 });
            handlers.onStageChange(stageId, label, detail);
          },
          onStagePass: (stageId, detail) => {
            // Advance the progress bar as each stage passes.
            dispatch({ type: "PROCESS", progress: state.status === "PROCESSING" ? Math.min(100, state.progress + 25) : 50 });
            handlers.onStageChange(stageId, "passed", detail);
          },
          onStageFail: (stageId, reason) => {
            logger.tryon(`Stage failed: ${stageId}`, { detail: reason, level: "error" });
          },
        });

        if (!result.passed) {
          logger.tryon("Validation failed — aborting", { detail: result.failureReason, level: "error" });
          sessionStorage.removeItem("nova_pending_capture");
          const failMsg = result.failureReason ?? "Validation failed. Please retake.";
          dispatch({ type: "FAIL", message: failMsg });
          handlers.onError(failMsg);
          return;
        }

        validatedDataUrl = result.validatedDataUrl;
        validatedSizeKb = result.sizeKb;
        logger.tryon("Validation passed", {
          detail: `Size: ${validatedSizeKb.toFixed(0)} KB, score: ${(result.personScore * 100).toFixed(0)}%`,
        });

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
      dispatch({ type: "PROCESS", progress: 75 });
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
        const msg = apiErr instanceof Error ? apiErr.message : "TryOn AI unreachable.";
        logger.network("TryOn AI call failed", { detail: msg, level: "error" });
        handlers.onStageChange("calling-ai", "AI unavailable — using preview", msg.slice(0, 80));
        resultUrl = validatedDataUrl;
        mockResult = true;
      }

      // ─── BRAND TRACKING ─────────────────────────────────────────────────
      dispatch({ type: "PROCESS", progress: 90 });
      handlers.onStageChange("tracking-brand", "Logging brand request", `${brand.name} · ${product.sku}`);
      const brandReq = {
        brandId: brand.id,
        franchiseId: user?.franchiseId ?? "unknown",
        userId: user?.id ?? "anonymous",
        productSku: product.sku,
        timestamp: Date.now(),
        status: "success" as const,
      };
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

      dispatch({ type: "COMPLETE", resultUrl });
      handlers.onResult(resultUrl, brandReq.brandId);
    },
    [addTryOnResult, addSavedImage, setActiveCapture, brand.id, brand.name, handlers, setLastResult, trackBrandRequest, user?.franchiseId, user?.id, validate],
  );

  /** Resets the state machine to IDLE. Call when the user leaves the result screen. */
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  /** Convenience action dispatchers — consumers can drive the state machine
   *  for UI-only transitions (e.g. marking CAMERA_INITIALIZING before run). */
  const actions = {
    startCamera: () => dispatch({ type: "START_CAMERA" }),
    poseAlign: () => dispatch({ type: "POSE_ALIGN" }),
    capture: () => dispatch({ type: "CAPTURE" }),
    reset,
  };

  return { run, state, actions, modelStatus, modelProgress };
}

/**
 * Calls the BACKEND proxy endpoint `POST /api/tryon/run` which:
 *   1. Resolves the customer from the JWT (or body franchiseId/customerId).
 *   2. Loads the customer's active API key from the database (NOT env var).
 *   3. Forwards the request to FASHN.ai with the decrypted key.
 *   4. Polls FASHN.ai status until the job completes.
 *   5. Returns `{ success: true, data: { resultImage, mock, provider } }`.
 */
async function callTryOnApi(
  capturedDataUrl: string,
  product: Product,
): Promise<{ resultImage: string; mock: boolean; provider: string }> {
  logger.network("Calling TryOn AI via backend proxy", {
    detail: `POST /api/tryon/run · ${product.sku}`,
  });

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
      customerId: undefined,
    });
  } catch (apiErr: unknown) {
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
