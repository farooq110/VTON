import { Badge } from "@/client/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  Hourglass,
} from "lucide-react";
import type { VtonStatus } from "@/shared/types";

const MAP: Record<
  VtonStatus,
  { variant: "info" | "warning" | "success" | "destructive" | "secondary"; icon: typeof Clock; label: string }
> = {
  pending: { variant: "secondary", icon: Hourglass, label: "Pending" },
  queued: { variant: "secondary", icon: Hourglass, label: "Queued" },
  processing: { variant: "info", icon: Loader2, label: "Processing" },
  completed: { variant: "success", icon: CheckCircle2, label: "Completed" },
  failed: { variant: "destructive", icon: XCircle, label: "Failed" },
};

export function VtonStatusBadge({ status }: { status: VtonStatus }) {
  const cfg = MAP[status] ?? MAP.pending;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="inline-flex items-center gap-1">
      <Icon className={"h-3 w-3 " + (status === "processing" ? "animate-spin" : "")} />
      {cfg.label}
    </Badge>
  );
}

const SEVERITY_MAP = {
  info: { variant: "info" as const, label: "Info" },
  success: { variant: "success" as const, label: "Success" },
  warning: { variant: "warning" as const, label: "Warning" },
  error: { variant: "destructive" as const, label: "Error" },
};

export function SeverityBadge({
  severity,
}: {
  severity: keyof typeof SEVERITY_MAP;
}) {
  const cfg = SEVERITY_MAP[severity] ?? SEVERITY_MAP.info;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "ACTIVE" || status === "active"
      ? "success"
      : status === "SUSPENDED" || status === "suspended"
        ? "warning"
        : status === "CHURNED" || status === "churned"
          ? "destructive"
          : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}
