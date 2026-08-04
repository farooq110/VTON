import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

/** Toast shape — produced by the useToast hook. */
export interface ToastT {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  durationMs?: number;
}

interface ToastContextValue {
  toasts: ToastT[];
  toast: (t: Omit<ToastT, "id"> & { id?: string }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastT[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (t: Omit<ToastT, "id"> & { id?: string }) => {
      const id = t.id ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const duration = t.durationMs ?? 3500;
      setToasts((prev) => [...prev, { ...t, id }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** useToast — returns a stable `toast` function matching the shadcn API. */
export function useToast(): {
  toast: (t: Omit<ToastT, "id"> & { id?: string }) => void;
  dismiss: (id: string) => void;
  toasts: ToastT[];
} {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return { toast: ctx.toast, dismiss: ctx.dismiss, toasts: ctx.toasts };
}

/** Toaster — renders all active toasts. Mount once near the root.
 *
 * Positioned at TOP-RIGHT of the viewport (was bottom-right). All success
 * and error toasts appear here so the user always knows where to look. */
export function Toaster() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return null;
  return (
    <div className="pointer-events-none fixed top-0 right-0 z-[10000] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm">
      {ctx.toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 shadow-elevated animate-fade-up",
            t.variant === "destructive"
              ? "border-destructive/40 bg-destructive text-white"
              : "border-border bg-card text-card-foreground",
          )}
        >
          {t.variant === "destructive" ? (
            <X className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          )}
          <div className="flex-1 min-w-0">
            {t.title && <p className="text-sm font-semibold leading-tight">{t.title}</p>}
            {t.description && (
              <p className="text-xs opacity-90 mt-0.5">{t.description}</p>
            )}
          </div>
          <button
            onClick={() => ctx.dismiss(t.id)}
            className="text-current opacity-50 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
