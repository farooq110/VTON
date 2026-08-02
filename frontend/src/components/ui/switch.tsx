import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked" | "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Switch — a toggle control.
 *
 * Uses DIRECT conditional classes (not `peer` CSS) so the visual state
 * always matches the `checked` prop. The previous `peer-checked:` approach
 * could fail to update visually when the parent re-rendered via Framer
 * Motion's AnimatePresence.
 *
 * The native `<input type="checkbox">` is visually hidden (sr-only) so it
 * remains accessible to screen readers and keyboard navigation, while the
 * visible track + thumb are rendered as siblings. Because the input is
 * shrunk to 1×1 px by `sr-only`, clicking the visible track/thumb would NOT
 * toggle the input by default — so we wire an explicit `onClick` on the
 * outer span that calls `onCheckedChange`. This guarantees the toggle
 * updates BOTH the value AND the visual state on every click.
 */
const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <span
      className={cn("relative inline-flex h-6 w-11 items-center select-none", className)}
      // Whole surface is clickable — toggles the underlying input. We
      // intentionally do NOT stopPropagation here so click logs still
      // bubble to parents if they want them.
      onClick={(e) => {
        if (disabled) return;
        e.preventDefault();
        onCheckedChange?.(!checked);
      }}
      role="presentation"
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className="sr-only"
        // The input is keyboard-focusable; clicking is handled by the
        // parent span's onClick so the visible control is always in sync.
        onClick={(e) => e.stopPropagation()}
        {...props}
      />
      {/* Track — color depends directly on `checked` prop */}
      <span
        className={cn(
          "absolute inset-0 cursor-pointer rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
          disabled && "cursor-not-allowed opacity-50",
        )}
      />
      {/* Thumb — position depends directly on `checked` prop */}
      <span
        className={cn(
          "absolute left-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          checked && "translate-x-5",
        )}
      />
    </span>
  ),
);
Switch.displayName = "Switch";

export { Switch };
