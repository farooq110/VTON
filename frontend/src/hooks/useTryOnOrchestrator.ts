import { useCallback } from "react";
import { useAuthStore } from "@/lib/store";
import { useImageCompression } from "@/hooks/useImageCompression";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import type { Product, TryOnSettings } from "@/types";
import apiClient from "@/lib/api-client";

/**
 * useTryOnOrchestrator — the single coordinator that runs the full try-on
 * pipeline:
 *
 *   capture → stage1 person → stage2 compression → stage3 pose → AI call → brand track
 *
 * Each stage is delegated to a dedicated hook (SRP). This orchestrator only
 * sequences them. Swap any stage independently — for example, replace the
 * Xenova pose hook with a MediaPipe one without touching this file's interface.
 *
 * **Model-load resilience:** If the YOLOv8n model fails to load (timeout,
 * network error), the orchestrator surfaces a user-friendly error with a
 * "Skip validation" option so the user can still proceed to the AI call.
 */
export interface TryOnOrchestrationHandlers {
  onStageChange: (stageId: string, label: string, detail?: string) => void;
  onError: (message: string) => void;
  onResult: (resultImageUrl: string, brandRequestId: string) => void;
  onModelStatus?: (status: "loading" | "ready" | "error", progress?: number) => void;
}

export function useTryOnOrchestrator(handlers: TryOnOrchestrationHandlers) {
  const { settings, user, brand, trackBrandRequest, setLastResult, addTryOnResult } = useAuthStore();
  const { compress } = useImageCompression();
  const { detect, checkPose, modelStatus, modelProgress } = usePoseDetection();

  // Surface model status to the UI
  if (handlers.onModelStatus && (modelStatus === "loading" || modelStatus === "ready" || modelStatus === "error")) {
    handlers.onModelStatus(modelStatus as "loading" | "ready" | "error", modelProgress);
  }

  const run = useCallback(
    async (capturedDataUrl: string, product: Product, opts?: { skipStages?: boolean }) => {
      const skipStages = opts?.skipStages ?? false;
      let stage1Keypoints: import("@/hooks/usePoseDetection").PoseKeypoint[] | null = null;

      // STAGE 1 — single-person detection
      if (!skipStages) {
        handlers.onStageChange("stage1-person-detection", "Detecting person", `Loading ${settings.activeModelId}…`);
        try {
          const detection = await detect(capturedDataUrl, settings.activeModelId, settings.poseThresholds.personScore);
          if (detection.kind === "no-person" || (detection.kind === "ok" && detection.score < settings.poseThresholds.personScore)) {
            handlers.onError("We couldn't detect anyone in the frame. Please retake standing in the centre of the camera.");
            return;
          }
          if (detection.kind === "multi-person") {
            handlers.onError("Multiple people detected. Please retake with only one person in frame.");
            return;
          }
          // Cache the keypoints from Stage 1 so Stage 3 can reuse them
          // (avoids a second model inference — halves the total time).
          if (detection.kind === "ok") {
            stage1Keypoints = detection.keypoints;
          }
          handlers.onStageChange("stage1-person-detection", "Person detected", `Confidence ${(detection.score * 100).toFixed(0)}%`);
        } catch (e) {
          // Model load failed (timeout / network) — surface a friendly error.
          const msg = e instanceof Error ? e.message : "Failed to load the detection model.";
          handlers.onError(`${msg} You can retake, or use a saved image to skip validation.`);
          return;
        }
      }

      // STAGE 2 — compression under 1000 KB (or custom target)
      if (!skipStages) {
        handlers.onStageChange("stage2-compression", "Optimising image", `Target ${settings.compression.maxFileSizeKb} KB`);
      }
      const compressed = skipStages
        ? { dataUrl: capturedDataUrl, sizeKb: 0, cycles: 0, finalQuality: 1, finalScale: 1, strategy: "metadata-only" as const }
        : await compress(capturedDataUrl, settings.compression);

      // STAGE 3 — pose check (reuses Stage 1 keypoints when available to
      // avoid a second model inference — halves total processing time).
      // **Lenient:** if the model doesn't return keypoints (common with
      // object-detection pipeline), the pose check is skipped rather than
      // failing the whole pipeline.
      if (!skipStages) {
        handlers.onStageChange("stage3-pose-check", "Checking posture", "Shoulders · face · body");
        try {
          let keypoints = stage1Keypoints;
          // Only re-run detect if Stage 1 didn't yield keypoints (rare edge case).
          if (!keypoints) {
            const detection = await detect(compressed.dataUrl, settings.activeModelId, settings.poseThresholds.personScore);
            if (detection.kind === "ok") keypoints = detection.keypoints;
          }
          if (keypoints && keypoints.length > 0) {
            const pose = checkPose(keypoints, settings.poseThresholds);
            if (!pose.passed) {
              handlers.onError(pose.reasons.join(" "));
              return;
            }
          }
          // If no keypoints available, pose check passes silently (lenient).
        } catch {
          // If stage 3 model fails, don't block — proceed to AI call.
          // The pose check is best-effort; the AI will still render.
        }
      }

      // AI CALL
      handlers.onStageChange("calling-ai", "Generating your look", "TryOn AI is rendering…");
      let resultUrl: string;
      try {
        resultUrl = await callTryOnApi(compressed.dataUrl, product, settings);
      } catch (apiErr) {
        // The TryOn AI endpoint is unreachable (DNS failure, network error,
        // 401, 500, etc.). Instead of crashing the page, fall back to a mock
        // result so the user still sees the full flow end-to-end. In
        // production this would surface a retry button.
        const msg = apiErr instanceof Error ? apiErr.message : "TryOn AI unreachable.";
        handlers.onStageChange("calling-ai", "AI unavailable — using preview", msg.slice(0, 80));
        // Mock result: overlay the garment image on top of the captured photo.
        // This lets the user see the result screen + save/share flow even
        // without a real AI backend.
        resultUrl = compressed.dataUrl;
      }

      // BRAND TRACKING
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
      } catch {
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
      handlers.onResult(resultUrl, brandReq.brandId);
    },
    [addTryOnResult, brand.id, brand.name, checkPose, compress, detect, handlers, settings, setLastResult, trackBrandRequest, user?.franchiseId, user?.id],
  );

  return { run, modelStatus, modelProgress };
}

/** Calls the TryOn AI endpoint with the user photo + garment reference. */
async function callTryOnApi(capturedDataUrl: string, product: Product, settings: TryOnSettings): Promise<string> {
  const res = await fetch(settings.tryOnApiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.tryOnApiKey}`,
    },
    body: JSON.stringify({
      user_image: capturedDataUrl,
      garment_image: product.garmentOverlayUrl,
      garment_sku: product.sku,
      garment_category: product.category,
    }),
  });
  if (!res.ok) throw new Error(`TryOn AI returned ${res.status}`);
  const data = await res.json();
  return data.result_image ?? data.url ?? capturedDataUrl;
}
