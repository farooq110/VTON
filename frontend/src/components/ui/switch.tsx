import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked" | "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

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
        className="peer sr-only"
        {...props}
      />
      <span
        className={cn(
          "absolute inset-0 cursor-pointer rounded-full bg-muted transition-colors",
          "peer-checked:bg-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 peer-focus-visible:ring-offset-2",
        )}
      />
      <span
        className={cn(
          "absolute left-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          "peer-checked:translate-x-5",
        )}
      />
    </span>
  ),
);
Switch.displayName = "Switch";

export { Switch };
