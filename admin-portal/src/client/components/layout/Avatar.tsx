import { cn } from "@/client/lib/utils";

interface AvatarProps {
  className?: string;
  children?: React.ReactNode;
}

export function Avatar({ className, children }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AvatarFallback({ children }: { children?: React.ReactNode }) {
  return <span>{children}</span>;
}
