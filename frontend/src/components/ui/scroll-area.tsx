import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ScrollArea — a styled wrapper around native overflow:auto.
 * Uses the `.scrollbar-boutique` class from index.css for the thin themed scrollbar.
 */
export function ScrollArea({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("scrollbar-boutique overflow-auto", className)}
      {...props}
    >
      {children}
    </div>
  );
}
