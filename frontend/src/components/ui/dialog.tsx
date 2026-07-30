import { cn } from "@/lib/utils";

/** Minimal dialog wrapper — uses native <dialog> semantics for accessibility. */
export function Dialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={cn("relative max-w-lg w-full rounded-2xl bg-card p-6 shadow-elevated", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
