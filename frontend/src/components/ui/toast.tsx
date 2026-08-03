import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, X } from "lucide-react";

/** Toast shape — produced by the useToast hook. */
export interface ToastT {
  id: string;
  title?: string;
  description?: string;
  /** Issue 4 fix — added "warning" variant for friendly warnings that are
   *  neither success (green check) nor error (red X). Renders amber. */
  variant?: "default" | "destructive" | "warning";
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
 * Issue 5 fix — all toast variants now share the EXACT same layout +
 * design: same padding, border-radius, shadow, icon size, title/description
 * typography, dismiss button. Only the COLOR (background, border, icon)
 * differs per variant. This guarantees visual consistency everywhere.
 *
 * Positioned at TOP-RIGHT of the viewport. All success, warning, and error
 * toasts appear here so the user always knows where to look. */
export function Toaster() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return null;
  return (
    <div className="pointer-events-none fixed top-0 right-0 z-[10000] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm">
      {ctx.toasts.map((t) => {
        // Issue 5 fix — single source of truth for variant styling. Every
        // variant uses the same layout; only colors change. This ensures
        // the toaster looks identical everywhere regardless of content.
        const variantStyles = {
          destructive: {
            container: "border-destructive/40 bg-destructive text-white",
            icon: <X className="mt-0.5 h-4 w-4 shrink-0" />,
          },
          warning: {
            container: "border-amber-500/40 bg-amber-50 text-amber-900",
            icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />,
          },
          default: {
            container: "border-border bg-card text-card-foreground",
            icon: <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />,
          },
        }[t.variant ?? "default"];

        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 shadow-elevated animate-fade-up",
              variantStyles.container,
            )}
          >
            {variantStyles.icon}
            <div className="flex-1 min-w-0">
              {t.title && <p className="text-sm font-semibold leading-tight">{t.title}</p>}
              {t.description && (
                <p className="text-xs opacity-90 mt-0.5">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => ctx.dismiss(t.id)}
              className="text-current opacity-50 hover:opacity-100 shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
