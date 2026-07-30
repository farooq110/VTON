import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CreditCard,
  Shirt,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { KpiCard } from "@/client/components/shared/KpiCard";
import { LoadingState, ErrorState } from "@/client/components/shared/EmptyState";
import { apiGet } from "@/client/lib/api-client";
import { ROUTES } from "@/shared/constants";
import type { ActivitySummary } from "@/shared/types";
import { timeAgo, formatDateTime } from "@/client/lib/utils";

export default function DashboardPage() {
  const summary = useQuery<ActivitySummary>({
    queryKey: ["activity", "summary"],
    queryFn: () => apiGet<ActivitySummary>("/activity/summary"),
    staleTime: 30 * 1000,
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.isLoading ? (
          <LoadingState label="Loading KPIs…" />
        ) : summary.isError ? (
          <ErrorState
            message="Could not load dashboard KPIs."
            onRetry={() => summary.refetch()}
          />
        ) : (
          <>
            <KpiCard
              label="Customers"
              value={summary.data?.totals.customers ?? 0}
              hint={`${summary.data?.totals.activeCustomers ?? 0} active`}
              icon={Users}
              accent="info"
            />
            <KpiCard
              label="Franchises"
              value={summary.data?.totals.franchises ?? 0}
              icon={Activity}
              accent="success"
            />
            <KpiCard
              label="API Keys"
              value={summary.data?.totals.apiKeys ?? 0}
              hint={`${summary.data?.totals.activeApiKeys ?? 0} active`}
              icon={CreditCard}
              accent="warning"
            />
            <KpiCard
              label="Credits used"
              value={(summary.data?.totals.totalCreditsUsed ?? 0).toLocaleString()}
              hint="All time"
              icon={Shirt}
              accent="default"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent activity (24h)</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to={ROUTES.ACTIVITY}>
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <LoadingState />
            ) : summary.isError ? (
              <ErrorState
                message="Could not load recent activity."
                onRetry={() => summary.refetch()}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <StatRow
                  label="VTON requests"
                  value={summary.data?.last24h.vtonRequests ?? 0}
                />
                <StatRow
                  label="Completed"
                  value={summary.data?.last24h.completedVtonRequests ?? 0}
                />
                <StatRow
                  label="Failed"
                  value={summary.data?.last24h.failedVtonRequests ?? 0}
                />
              </div>
            )}

            <div className="mt-6">
              <div className="mb-2 text-sm font-medium text-muted-foreground">
                Usage by day (last 7)
              </div>
              <div className="flex flex-col gap-1">
                {(summary.data?.byDay ?? []).slice(-7).map((d) => (
                  <div
                    key={d.day}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {formatDateTime(d.day)}
                    </span>
                    <span className="font-medium">
                      {d.count} · {d.credits} cr
                    </span>
                  </div>
                ))}
                {(summary.data?.byDay ?? []).length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No usage recorded yet.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink
              to={ROUTES.CUSTOMERS}
              icon={Users}
              title="Customers"
              desc="Manage accounts & API keys"
            />
            <QuickLink
              to={ROUTES.VTON}
              icon={Shirt}
              title="Try-On Requests"
              desc="View & submit VTON jobs"
            />
            <QuickLink
              to={ROUTES.USAGE}
              icon={Activity}
              title="Usage"
              desc="Track credit consumption"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: typeof Users;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
