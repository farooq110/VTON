import { useEffect } from "react";

/**
 * useBodyScrollLock — lock the page body's scroll while a modal/drawer is open.
 *
 * Pass `true` while the overlay is mounted. The hook sets
 * `document.body.style.overflow = "hidden"` on mount and restores the
 * previous value on unmount, so the page behind the modal never scrolls
 * while the user scrolls inside the modal.
 *
 * Pairs well with `overscroll-contain` on the modal's inner scroll area,
 * which prevents scroll-chaining when the inner content reaches its edge.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}
