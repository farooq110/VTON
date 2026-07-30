import { useCallback, useRef } from "react";

/**
 * useHiddenLogout — invisible long-press trigger for sign-out.
 *
 * Returns a bag of pointer/touch event handlers that should be spread onto
 * any element acting as the "hidden logout" affordance (typically the brand
 * logo on the home page header).
 *
 * Behavior:
 *   - Press + hold the element for `holdMs` (default 1.5s) → `onTrigger` fires.
 *   - Release early or move the pointer away → the pending timer is cancelled
 *     so a normal click/tap never triggers sign-out.
 *   - Works with mouse, touch, and pen pointers.
 *
 * Spec: "Keep hidden long-press logout on brand logo" — the brand lockup is
 * the only element wired up to this hook on the home screen. A casual user
 * tapping the logo sees nothing happen; a manager who knows the gesture can
 * long-press to bring up sign-out.
 */
export function useHiddenLogout(
  onTrigger: () => void,
  holdMs = 1500,
): {
  onMouseDown: () => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
} {
  const timerRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    cancel();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onTrigger();
    }, holdMs);
  }, [onTrigger, holdMs, cancel]);

  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
