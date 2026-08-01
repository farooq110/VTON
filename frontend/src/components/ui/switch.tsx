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
 */
const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <span className={cn("relative inline-flex h-6 w-11 items-center", className)}>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className="sr-only"
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
