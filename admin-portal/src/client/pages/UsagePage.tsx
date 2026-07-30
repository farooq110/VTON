import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { ViewToggle, type ViewMode } from "@/client/components/shared/ViewToggle";
import { Pagination } from "@/client/components/shared/Pagination";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/client/components/shared/EmptyState";
import { apiGet, apiGetPaginated, extractApiError } from "@/client/lib/api-client";
import { useAppSettings } from "@/client/hooks/useAppSettings";
import { buildQuery, formatDate } from "@/client/lib/utils";
import { PAGE_SIZE, ROUTES, TIME_RANGES, type TimeRangeValue } from "@/shared/constants";
import type { Customer, Franchise, Usage } from "@/shared/types";

export default function UsagePage() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const [range, setRange] = useState<TimeRangeValue>("7d");
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);

  // Franchise usage (table/grid)
  const franchiseUsage = useQuery({
    queryKey: ["usage", "franchise", range],
    queryFn: () => {
      const { start, end } = rangeToDates(range);
      return apiGetPaginated<Usage>(
        `/usage${buildQuery({
          page: 1,
          pageSize: 50,
          start: start?.toISOString(),
          end: end?.toISOString(),
        })}`,
      );
    },
    staleTime: 30 * 1000,
  });

  // Per-customer overview
  const customers = useQuery({
    queryKey: ["usage", "customers", page],
    queryFn: () =>
      apiGetPaginated<Customer>(
        `/customers${buildQuery({ page, pageSize: PAGE_SIZE })}`,
      ),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Franchise usage</CardTitle>
            <p className="text-sm text-muted-foreground">
              Recent credit usage across franchises.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as TimeRangeValue)}>
              <TabsList>
                {TIME_RANGES.map((r) => (
                  <TabsTrigger key={r.value} value={r.value}>
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ViewToggle value={view} onChange={setView} />
          </div>
        </CardHeader>
        <CardContent>
          {franchiseUsage.isLoading ? (
            <LoadingState />
          ) : franchiseUsage.isError ? (
            <ErrorState
              message={extractApiError(franchiseUsage.error)}
              onRetry={() => franchiseUsage.refetch()}
            />
          ) : franchiseUsage.data && franchiseUsage.data.items.length > 0 ? (
            view === "table" ? (
              <UsageTable items={franchiseUsage.data.items} />
            ) : (
              <UsageGrid items={franchiseUsage.data.items} />
            )
          ) : (
            <EmptyState title="No usage in this range" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-customer overview</CardTitle>
          <p className="text-sm text-muted-foreground">
            Click a customer to view detailed usage.
          </p>
        </CardHeader>
        <CardContent>
          {customers.isLoading ? (
            <LoadingState />
          ) : customers.isError ? (
            <ErrorState
              message={extractApiError(customers.error)}
              onRetry={() => customers.refetch()}
            />
          ) : customers.data && customers.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-center">Franchises</TableHead>
                  <TableHead className="text-center">API Keys</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.data.items.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`${ROUTES.USAGE}/${c.id}`)}
                  >
                    <TableCell className="font-medium">
                      {c.businessName}
                    </TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-center">
                      {c._count?.franchises ?? 0}
                    </TableCell>
                    <TableCell className="text-center">
                      {c._count?.apiKeys ?? 0}
                    </TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">
                      {c.status}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No customers" />
          )}

          {customers.data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={customers.data.total}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageTable({ items }: { items: Usage[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Franchise</TableHead>
          <TableHead>Endpoint</TableHead>
          <TableHead className="text-right">Credits</TableHead>
          <TableHead>Day</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">
              {u.customer?.businessName ?? "—"}
            </TableCell>
            <TableCell>{u.franchise?.name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {u.endpoint ?? "—"}
            </TableCell>
            <TableCell className="text-right">{u.creditsUsed}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(u.day)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UsageGrid({ items }: { items: Usage[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((u) => (
        <Card key={u.id}>
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">
                {u.customer?.businessName ?? "—"}
              </div>
              <div className="text-sm font-bold text-primary">
                {u.creditsUsed} cr
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {u.franchise?.name ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {u.endpoint ?? "—"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function rangeToDates(range: TimeRangeValue): {
  start?: Date;
  end?: Date;
} {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (range === "7d") {
    return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
  }
  if (range === "30d") {
    return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
  }
  return {};
}
