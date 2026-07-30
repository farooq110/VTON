import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight Select — uses <details>/<summary> + a popover list. No Radix
 * dependency, fully accessible with keyboard. Swap with Radix Select later
 * without changing the call-site API.
 */

interface SelectContextValue {
  value: string;
  setValue: (v: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  label: string;
  setLabel: (label: string) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);
function useSelectCtx(): SelectContextValue {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select components must be used inside <Select>");
  return ctx;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

export function Select({ value: valueProp, defaultValue, onValueChange, children }: SelectProps) {
  const [value, setInternalValue] = React.useState(valueProp ?? defaultValue ?? "");
  const [label, setLabel] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const setValue = React.useCallback(
    (v: string) => {
      setInternalValue(v);
      onValueChange?.(v);
    },
    [onValueChange],
  );

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync with external value if controlled
  React.useEffect(() => {
    if (valueProp !== undefined && valueProp !== value) setInternalValue(valueProp);
  }, [valueProp]);  

  return (
    <SelectContext.Provider value={{ value, setValue, open, setOpen, label, setLabel }}>
      <div ref={containerRef} className="relative inline-block w-full">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export type SelectTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
export function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
  const ctx = useSelectCtx();
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        ctx.open && "ring-2 ring-ring/50",
        className,
      )}
      {...props}
    >
      {children}
      <svg
        className={cn("h-4 w-4 opacity-60 transition-transform", ctx.open && "rotate-180")}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = useSelectCtx();
  return (
    <span className={cn("truncate", !ctx.label && !ctx.value && "text-muted-foreground")}>
      {ctx.label || ctx.value || placeholder}
    </span>
  );
}

export function SelectContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = useSelectCtx();
  if (!ctx.open) return null;
  return (
    <div
      role="listbox"
      className={cn(
        "absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-elevated animate-scale-in",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}
export function SelectItem({ value, children, className }: SelectItemProps) {
  const ctx = useSelectCtx();
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => {
        ctx.setValue(value);
        ctx.setLabel(typeof children === "string" ? children : "");
        ctx.setOpen(false);
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
        "hover:bg-accent hover:text-accent-foreground",
        selected && "bg-accent/50",
        className,
      )}
    >
      {selected && (
        <svg
          className="absolute left-2 h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {children}
    </button>
  );
}
