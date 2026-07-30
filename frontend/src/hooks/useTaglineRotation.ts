import { useEffect, useRef, useState } from "react";
import { pickNextTagline } from "@/lib/taglines";

/** Picks a fresh random tagline every `refreshMs`. Stops cleanly on unmount. */
export function useTaglineRotation(refreshMs: number, active: boolean) {
  const [tagline, setTagline] = useState<string>(() => pickNextTagline());
  const prevRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    prevRef.current = tagline;
    const id = setInterval(() => {
      const next = pickNextTagline(prevRef.current);
      prevRef.current = next;
      setTagline(next);
    }, refreshMs);
    return () => clearInterval(id);
     
  }, [refreshMs, active]);

  return tagline;
}
