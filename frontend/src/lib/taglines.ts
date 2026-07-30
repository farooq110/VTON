/** Animated taglines shown while the TryOn AI is processing. */
export const TRYON_TAGLINES: string[] = [
  "Stitching your silhouette…",
  "Draping the garment pixel by pixel…",
  "Calibrating fabric fall and drape…",
  "Aligning shoulder seams…",
  "Softening light around the hem…",
  "Matching skin tone to lighting…",
  "Composing your mirror moment…",
  "Polishing every thread…",
  "Fitting the bodice to your form…",
  "Rendering shadow and shine…",
  "Tuning the silhouette to scale…",
  "Pressing the final look…",
  "Almost ready — last details…",
  "Smoothing the silhouette edges…",
  "Balancing colour to your palette…",
];

export function pickRandomTagline(): string {
  return TRYON_TAGLINES[Math.floor(Math.random() * TRYON_TAGLINES.length)] ?? TRYON_TAGLINES[0]!;
}

export function pickNextTagline(previous?: string): string {
  if (TRYON_TAGLINES.length < 2) return TRYON_TAGLINES[0]!;
  let next = previous;
  let guard = 0;
  while (next === previous && guard < 10) {
    next = pickRandomTagline();
    guard += 1;
  }
  return next!;
}
