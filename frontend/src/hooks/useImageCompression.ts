import { useCallback } from "react";
import imageCompression from "browser-image-compression";
import type { ImageCompressionSettings } from "@/types";
import { dataUrlSizeKb } from "@/lib/utils";

/**
 * useImageCompression — implements the spec'd compression pipeline:
 *   1. If size <= target → only strip metadata + chunks.
 *   2. Else: reduce quality by `qualityStep` in cycles until target hit.
 *   3. If quality reaches `minQuality` (0.70) — switch to dimension reduction
 *      (`dimensionStep` 5% per cycle) until target hit.
 *
 * Uses `browser-image-compression` for rich EXIF stripping. The interface
 * stays identical even if the underlying lib is swapped (DIP).
 */
export interface CompressionResult {
  dataUrl: string;
  sizeKb: number;
  cycles: number;
  finalQuality: number;
  finalScale: number;
  strategy: "metadata-only" | "quality" | "quality+dimensions";
}

function dataUrlToFile(dataUrl: string, filename = "capture.jpg"): Promise<File> {
  return fetch(dataUrl).then((r) => r.blob().then((b) => new File([b], filename, { type: b.type })));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useImageCompression() {
  const compress = useCallback(
    async (sourceDataUrl: string, settings: ImageCompressionSettings): Promise<CompressionResult> => {
      const target = settings.maxFileSizeKb;
      let current = sourceDataUrl;
      let sizeKb = dataUrlSizeKb(current);
      let cycles = 0;
      let quality = 0.95;
      let scale = 1;
      let strategy: CompressionResult["strategy"] = "metadata-only";

      // Stage 2a — always strip metadata + chunks via browser-image-compression
      const file = await dataUrlToFile(current);
      const stripped = await imageCompression(file, {
        maxSizeMB: Number.POSITIVE_INFINITY,
        useWebWorker: true,
        initialQuality: 0.95,
        alwaysKeepResolution: true,
      });
      current = await fileToDataUrl(stripped);
      sizeKb = dataUrlSizeKb(current);

      if (sizeKb <= target) {
        return { dataUrl: current, sizeKb, cycles: 0, finalQuality: quality, finalScale: scale, strategy: "metadata-only" };
      }

      // Stage 2b — quality reduction
      strategy = "quality";
      while (sizeKb > target && quality > settings.minQuality) {
        quality = Math.max(settings.minQuality, quality - settings.qualityStep);
        const f = await dataUrlToFile(current);
        const out = await imageCompression(f, {
          maxSizeMB: Number.POSITIVE_INFINITY,
          useWebWorker: true,
          initialQuality: quality,
          alwaysKeepResolution: true,
        });
        current = await fileToDataUrl(out);
        sizeKb = dataUrlSizeKb(current);
        cycles += 1;
        if (cycles > 40) break;
      }

      // Stage 2c — dimension reduction
      if (sizeKb > target) {
        strategy = "quality+dimensions";
        while (sizeKb > target && scale > 0.2) {
          scale = Math.max(0.2, scale - settings.dimensionStep);
          const f = await dataUrlToFile(current);
          const out = await imageCompression(f, {
            maxSizeMB: Number.POSITIVE_INFINITY,
            useWebWorker: true,
            initialQuality: quality,
            maxWidthOrHeight: Math.round(1920 * scale),
          });
          current = await fileToDataUrl(out);
          sizeKb = dataUrlSizeKb(current);
          cycles += 1;
          if (cycles > 80) break;
        }
      }

      return { dataUrl: current, sizeKb, cycles, finalQuality: quality, finalScale: scale, strategy };
    },
    [],
  );

  return { compress };
}
