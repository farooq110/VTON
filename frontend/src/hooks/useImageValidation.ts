import { useCallback, useRef } from "react";
import { usePoseDetection, type PoseKeypoint } from "@/hooks/usePoseDetection";
import { useImageCompression, type CompressionResult } from "@/hooks/useImageCompression";
import { useAuthStore } from "@/lib/store";
import { dataUrlSizeKb } from "@/lib/utils";
import type { ImageCompressionSettings, PoseThresholds } from "@/types";

/**
 * useImageValidation — the SINGLE SOURCE OF TRUTH for the 3-stage image
 * validation pipeline. Used by:
 *   - TryOnCameraPage (after capturing from the webcam)
 *   - AddCapturePanel (when uploading from disk or URL)
 *   - CapturesGalleryPage (when re-validating a saved image)
 *
 * Stages:
 *   1. Person detection — Xenova/yolov8n-pose. Rejects 0 persons or >1 person.
 *   2. Compression — browser-image-compression. Strips metadata, then reduces
 *      quality in 0.05 steps until 0.70, then reduces dimensions 5% per cycle
 *      until under the target file size.
 *   3. Pose check — reuses Stage 1 keypoints. Checks shoulder tilt, face yaw,
 *      face pitch, body visibility against the configured thresholds.
 *
 * **Single Responsibility:** this hook only runs the pipeline. It does NOT
 * decide what to do with the result (save, try-on, discard) — that's the
 * caller's job. This keeps it reusable across all 3 entry points.
 *
 * **Loose Coupling:** delegates to `usePoseDetection` + `useImageCompression`
 * — swap either one without touching this hook's interface.
 *
 * **Diagnostic Logging:** every stage start/pass/fail is logged via the
 * global `logActivity` store action when `settings.debugLogging` is enabled.
 */

export type ValidationStageId =
  | "stage1-person-detection"
  | "stage2-compression"
  | "stage3-pose-check";

export type ValidationStageStatus = "pending" | "active" | "passed" | "failed";

export interface ValidationStage {
  id: ValidationStageId;
  label: string;
  status: ValidationStageStatus;
  detail?: string;
  durationMs?: number;
}

export interface ValidationResult {
  passed: boolean;
  /** The compressed, validated image data URL (safe to send to the AI). */
  validatedDataUrl: string;
  /** Size of the validated image in KB. */
  sizeKb: number;
  /** How many compression cycles ran. */
  compressionCycles: number;
  /** Person detection confidence (0..1). */
  personScore: number;
  /** Number of keypoints detected. */
  keypointCount: number;
  /** Final compression strategy used. */
  strategy: CompressionResult["strategy"];
  /** If failed, the human-readable reason. */
  failureReason?: string;
  /** Which stage failed (if any). */
  failedStage?: ValidationStageId;
}

export interface ValidationCallbacks {
  /** Called when a stage starts. */
  onStageStart?: (stage: ValidationStageId, label: string, detail?: string) => void;
  /** Called when a stage passes. */
  onStagePass?: (stage: ValidationStageId, detail?: string, durationMs?: number) => void;
  /** Called when a stage fails. */
  onStageFail?: (stage: ValidationStageId, reason: string) => void;
  /** Called when the entire pipeline completes (pass or fail). */
  onComplete?: (result: ValidationResult) => void;
}

export function useImageValidation() {
  const { detect, checkPose, modelStatus, modelProgress } = usePoseDetection();
  const { compress } = useImageCompression();
  const settings = useAuthStore((s) => s.settings);
  const logActivity = useAuthStore((s) => s.logActivity);

  // Cache the last result so callers can inspect it without re-running.
  const lastResultRef = useRef<ValidationResult | null>(null);

  /**
   * Runs the full 3-stage validation pipeline on an image data URL.
   *
   * @param imageDataUrl — the raw captured/uploaded image (data URL or http URL)
   * @param callbacks — optional progress callbacks for UI updates
   * @param opts.skipPoseCheck — set true to skip Stage 3 (e.g. for non-person images)
   * @returns the validation result (passed = true means the image is safe to use)
   */
  const validate = useCallback(
    async (
      imageDataUrl: string,
      callbacks?: ValidationCallbacks,
      opts?: { skipPoseCheck?: boolean },
    ): Promise<ValidationResult> => {
      const skipPoseCheck = opts?.skipPoseCheck ?? false;
      const thresholds: PoseThresholds = settings.poseThresholds;
      const compressionSettings: ImageCompressionSettings = settings.compression;
      const activeModelId = settings.activeModelId;

      const log = (
        category: Parameters<typeof logActivity>[0]["category"],
        label: string,
        detail?: string,
        level: "info" | "warn" | "error" = "info",
        durationMs?: number,
      ) => {
        logActivity({ category, label, detail, level, durationMs });
      };

      const startTime = Date.now();
      log("capture", "Validation pipeline started", `Image size: ${dataUrlSizeKb(imageDataUrl).toFixed(0)} KB`);

      // ─── STAGE 1: Person detection ──────────────────────────────────────
      let stage1Keypoints: PoseKeypoint[] | null = null;
      let personScore = 0;
      {
        const stageStart = Date.now();
        callbacks?.onStageStart?.("stage1-person-detection", "Detecting person", `Loading ${activeModelId}…`);
        log("model", "Stage 1: loading detection model", `${activeModelId} (score threshold: ${thresholds.personScore})`);

        try {
          const detection = await detect(imageDataUrl, activeModelId, thresholds.personScore);

          if (detection.kind === "no-person" || (detection.kind === "ok" && detection.score < thresholds.personScore)) {
            const reason = "No person detected in the frame. Please stand in the center of the camera.";
            log("capture", "Stage 1 FAILED: no person", reason, "error", Date.now() - stageStart);
            callbacks?.onStageFail?.("stage1-person-detection", reason);
            const result: ValidationResult = {
              passed: false,
              validatedDataUrl: imageDataUrl,
              sizeKb: dataUrlSizeKb(imageDataUrl),
              compressionCycles: 0,
              personScore: detection.score,
              keypointCount: 0,
              strategy: "metadata-only",
              failureReason: reason,
              failedStage: "stage1-person-detection",
            };
            lastResultRef.current = result;
            callbacks?.onComplete?.(result);
            return result;
          }

          if (detection.kind === "multi-person") {
            const reason = `Multiple people detected (${detection.personCount}). Please retake with only one person in frame.`;
            log("capture", "Stage 1 FAILED: multiple persons", reason, "error", Date.now() - stageStart);
            callbacks?.onStageFail?.("stage1-person-detection", reason);
            const result: ValidationResult = {
              passed: false,
              validatedDataUrl: imageDataUrl,
              sizeKb: dataUrlSizeKb(imageDataUrl),
              compressionCycles: 0,
              personScore: detection.score,
              keypointCount: 0,
              strategy: "metadata-only",
              failureReason: reason,
              failedStage: "stage1-person-detection",
            };
            lastResultRef.current = result;
            callbacks?.onComplete?.(result);
            return result;
          }

          // ok — single person
          personScore = detection.score;
          stage1Keypoints = detection.keypoints;
          const detail = `Person detected — confidence ${(detection.score * 100).toFixed(0)}%`;
          log("model", "Stage 1 PASSED: person detected", detail, "info", Date.now() - stageStart);
          callbacks?.onStagePass?.("stage1-person-detection", detail, Date.now() - stageStart);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Model failed to load";
          log("model", "Stage 1 ERROR: model load failed", msg, "error", Date.now() - stageStart);
          callbacks?.onStageFail?.("stage1-person-detection", msg);
          const result: ValidationResult = {
            passed: false,
            validatedDataUrl: imageDataUrl,
            sizeKb: dataUrlSizeKb(imageDataUrl),
            compressionCycles: 0,
            personScore: 0,
            keypointCount: 0,
            strategy: "metadata-only",
            failureReason: `${msg} You can retake, or use a saved image to skip validation.`,
            failedStage: "stage1-person-detection",
          };
          lastResultRef.current = result;
          callbacks?.onComplete?.(result);
          return result;
        }
      }

      // ─── STAGE 2: Compression ───────────────────────────────────────────
      let compressed: CompressionResult;
      {
        const stageStart = Date.now();
        const target = compressionSettings.maxFileSizeKb;
        const initialSize = dataUrlSizeKb(imageDataUrl);
        callbacks?.onStageStart?.("stage2-compression", "Optimising image", `${initialSize.toFixed(0)} KB → target ${target} KB`);
        log("compression", "Stage 2: compression started", `Initial: ${initialSize.toFixed(0)} KB, target: ${target} KB`);

        try {
          compressed = await compress(imageDataUrl, compressionSettings);
          const detail = `${initialSize.toFixed(0)} KB → ${compressed.sizeKb.toFixed(0)} KB (${compressed.strategy}, ${compressed.cycles} cycles)`;
          log("compression", "Stage 2 PASSED: image compressed", detail, "info", Date.now() - stageStart);
          callbacks?.onStagePass?.("stage2-compression", detail, Date.now() - stageStart);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Compression failed";
          log("compression", "Stage 2 ERROR: compression failed", msg, "error", Date.now() - stageStart);
          callbacks?.onStageFail?.("stage2-compression", msg);
          // Compression failure is non-fatal — use the original image.
          compressed = {
            dataUrl: imageDataUrl,
            sizeKb: initialSize,
            cycles: 0,
            finalQuality: 1,
            finalScale: 1,
            strategy: "metadata-only",
          };
        }
      }

      // ─── STAGE 3: Pose check (skippable) ────────────────────────────────
      if (!skipPoseCheck) {
        const stageStart = Date.now();
        callbacks?.onStageStart?.("stage3-pose-check", "Checking posture", "Shoulders · face · body");
        log("capture", "Stage 3: pose check started", `Using ${stage1Keypoints ? "cached keypoints" : "fresh detection"}`);

        try {
          let keypoints = stage1Keypoints;
          // Only re-run detect if Stage 1 didn't yield keypoints (rare edge case).
          if (!keypoints) {
            const detection = await detect(compressed.dataUrl, activeModelId, thresholds.personScore);
            if (detection.kind === "ok") keypoints = detection.keypoints;
          }

          if (keypoints && keypoints.length > 0) {
            const pose = checkPose(keypoints, thresholds);
            if (!pose.passed) {
              const reason = pose.reasons.join(" ");
              log("capture", "Stage 3 FAILED: pose check", reason, "error", Date.now() - stageStart);
              callbacks?.onStageFail?.("stage3-pose-check", reason);
              const result: ValidationResult = {
                passed: false,
                validatedDataUrl: compressed.dataUrl,
                sizeKb: compressed.sizeKb,
                compressionCycles: compressed.cycles,
                personScore,
                keypointCount: keypoints.length,
                strategy: compressed.strategy,
                failureReason: reason,
                failedStage: "stage3-pose-check",
              };
              lastResultRef.current = result;
              callbacks?.onComplete?.(result);
              return result;
            }
            const detail = `Posture OK — shoulder tilt ${pose.shoulderTiltDeg.toFixed(1)}°, face yaw ${pose.faceYawDeg.toFixed(1)}°, visibility ${Math.round(pose.bodyVisibility * 100)}%`;
            log("capture", "Stage 3 PASSED: posture OK", detail, "info", Date.now() - stageStart);
            callbacks?.onStagePass?.("stage3-pose-check", detail, Date.now() - stageStart);
          } else {
            // No keypoints available — pose check passes silently (lenient).
            log("capture", "Stage 3 SKIPPED: no keypoints", "Model didn't return keypoints — skipping pose check", "warn", Date.now() - stageStart);
            callbacks?.onStagePass?.("stage3-pose-check", "Skipped (no keypoints)", Date.now() - stageStart);
          }
        } catch (err) {
          // Pose check is best-effort — don't block on failure.
          const msg = err instanceof Error ? err.message : "Pose check failed";
          log("capture", "Stage 3 ERROR: pose check threw", msg, "warn", Date.now() - stageStart);
          callbacks?.onStagePass?.("stage3-pose-check", "Skipped (error)", Date.now() - stageStart);
        }
      }

      // ─── All stages passed ──────────────────────────────────────────────
      const totalMs = Date.now() - startTime;
      const result: ValidationResult = {
        passed: true,
        validatedDataUrl: compressed.dataUrl,
        sizeKb: compressed.sizeKb,
        compressionCycles: compressed.cycles,
        personScore,
        keypointCount: stage1Keypoints?.length ?? 0,
        strategy: compressed.strategy,
      };
      lastResultRef.current = result;
      log("capture", "Validation pipeline PASSED", `All stages passed in ${totalMs}ms`, "info", totalMs);
      callbacks?.onComplete?.(result);
      return result;
    },
    [checkPose, compress, detect, logActivity, settings.activeModelId, settings.compression, settings.poseThresholds],
  );

  return {
    validate,
    modelStatus,
    modelProgress,
    lastResult: lastResultRef,
  };
}
