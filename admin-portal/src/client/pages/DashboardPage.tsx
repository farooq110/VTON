import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CreditCard,
  Shirt,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { Badge } from "@/client/components/ui/badge";
import {
  LoadingState,
  ErrorState,
} from "@/client/components/shared/EmptyState";
import { apiGet, apiGetPaginated } from "@/client/lib/api-client";
import { ROUTES } from "@/shared/constants";
import type { ActivitySummary, Customer } from "@/shared/types";
import { formatDate } from "@/client/lib/utils";

export default function DashboardPage() {
  const summary = useQuery<ActivitySummary>({
    queryKey: ["activity", "summary"],
    queryFn: () => apiGet<ActivitySummary>("/activity/summary"),
    staleTime: 30 * 1000,
  });

  const recentCustomers = useQuery({
    queryKey: ["customers", "recent"],
    queryFn: () =>
      apiGetPaginated<Customer>("/customers?page=1&pageSize=5"),
    staleTime: 60 * 1000,
  });

  const isLoading = summary.isLoading;
  const isError = summary.isError;

  // Derive API events + errors from activity summary
  const apiEvents24h =
    (summary.data?.last24h.vtonRequests ?? 0) +
    (summary.data?.last24h.usageRecords ?? 0);
  const errors24h = summary.data?.last24h.failedVtonRequests ?? 0;
  const warnings24h = summary.data?.totals.pendingVtonRequests ?? 0;
  const errorRate =
    apiEvents24h > 0 ? (errors24h / apiEvents24h) * 100 : 0;

  const stats = [
    {
      label: "Customers",
      value: summary.data?.totals.customers ?? 0,
      icon: Users,
      to: ROUTES.CUSTOMERS,
      accent: "text-primary",
    },
    {
      label: "Franchises",
      value: summary.data?.totals.franchises ?? 0,
      icon: Store,
      to: ROUTES.FRANCHISES,
      accent: "text-emerald-600",
    },
    {
      label: "API events (24h)",
      value: apiEvents24h,
      icon: BarChart3,
      to: ROUTES.ACTIVITY,
      accent: "text-primary",
    },
    {
      label: "Errors (24h)",
      value: errors24h,
      icon: AlertTriangle,
      to: ROUTES.ACTIVITY,
      accent: errors24h > 0 ? "text-destructive" : "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          <LoadingState label="Loading KPIs…" />
        ) : isError ? (
          <ErrorState
            message="Could not load dashboard KPIs."
            onRetry={() => summary.refetch()}
          />
        ) : (
          stats.map((s) => (
            <Link key={s.label} to={s.to}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="flex items-center gap-3 p-3 sm:p-4">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-md bg-accent text-accent-foreground grid place-items-center">
                    <s.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground truncate">
                      {s.label}
                    </div>
                    <div
                      className={`text-lg sm:text-xl font-semibold ${s.accent}`}
                    >
                      {s.value}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* Recent Customers + Production Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Customers */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle>Recent customers</CardTitle>
              <CardDescription>Latest additions</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
              <Link to={ROUTES.CUSTOMERS}>
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentCustomers.isLoading ? (
              <LoadingState label="Loading customers…" />
            ) : recentCustomers.isError ? (
              <ErrorState
                message="Could not load customers."
                onRetry={() => recentCustomers.refetch()}
              />
            ) : (
              recentCustomers.data?.items.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-2 border-b last:border-0 gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {c.businessName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.email}
                    </div>
                  </div>
                  <Badge
                    variant={c.status === "ACTIVE" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {c.status}
                  </Badge>
                </div>
              )) ?? (
                <div className="text-sm text-muted-foreground">
                  No customers yet.
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Production Activity 24h */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle>Production activity (24h)</CardTitle>
              <CardDescription>Error rate &amp; traffic</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
              <Link to={ROUTES.ACTIVITY}>
                Details <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
              <div className="p-2 sm:p-3 rounded-md bg-muted">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-base sm:text-lg font-semibold">
                  {apiEvents24h}
                </div>
              </div>
              <div className="p-2 sm:p-3 rounded-md bg-muted">
                <div className="text-xs text-muted-foreground">Warnings</div>
                <div className="text-base sm:text-lg font-semibold text-amber-600">
                  {warnings24h}
                </div>
              </div>
              <div className="p-2 sm:p-3 rounded-md bg-muted">
                <div className="text-xs text-muted-foreground">Errors</div>
                <div className="text-base sm:text-lg font-semibold text-destructive">
                  {errors24h}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <TrendingUp className="h-3.5 w-3.5" />
              Error rate:{" "}
              <span className="font-medium text-foreground">
                {errorRate.toFixed(2)}%
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground pt-2">
              Last updated: {formatDate(new Date().toISOString())}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          </div>
        </CardContent>
      </Card>
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
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
