import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: number[];
  onValueChange?: (value: number[]) => void;
}

/**
 * Minimal native-range slider. Visually themed via accent-color so it inherits
 * the boutique plum.
 *
 * FULLY CONTROLLED: The `value` prop is always used to set the input's value.
 * The `key` prop on the parent should be stable so React doesn't remount the
 * input on every render (which would lose focus/drag state).
 */
const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, defaultValue, onValueChange, ...props }, ref) => {
    // Extract the numeric value — default to 0 if not provided.
    const numValue =
      value && value.length > 0
        ? value[0]
        : Array.isArray(defaultValue) && defaultValue.length > 0
          ? defaultValue[0]
          : 0;
    return (
      <input
        ref={ref}
        type="range"
        value={numValue}
        onChange={(e) => onValueChange?.([Number(e.target.value)])}
        className={cn(
          "w-full h-2 cursor-pointer appearance-none rounded-full bg-muted",
          "accent-[var(--primary)]",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background",
          className,
        )}
        {...props}
      />
    );
  },
);
Slider.displayName = "Slider";

export { Slider };
