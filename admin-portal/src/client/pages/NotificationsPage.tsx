import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Eye, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { ViewToggle, type ViewMode } from "@/client/components/shared/ViewToggle";
import { Pagination } from "@/client/components/shared/Pagination";
import { SeverityBadge } from "@/client/components/shared/StatusBadges";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/client/components/shared/EmptyState";
import {
  apiGetPaginated,
  apiPost,
  extractApiError,
} from "@/client/lib/api-client";
import { useToast } from "@/client/hooks/useToast";
import { useDebounced } from "@/client/hooks/useDebounced";
import { buildQuery, formatDateTime, truncate } from "@/client/lib/utils";
import { PAGE_SIZE } from "@/shared/constants";
import type { Notification } from "@/shared/types";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<Notification | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ["notifications", page, debouncedSearch],
    queryFn: () =>
      apiGetPaginated<Notification>(
        `/notifications${buildQuery({ page, pageSize: PAGE_SIZE })}`,
      ),
    placeholderData: (prev) => prev,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiPost("/notifications/read-all"),
    onSuccess: (res: any) => {
      toast.success(`${res?.count ?? ""} marked as read`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  function openDetail(n: Notification) {
    setSelected(n);
    if (n.status === "unread") {
      markReadMutation.mutate(n.id);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Notifications</CardTitle>
            <p className="text-sm text-muted-foreground">
              System and customer notifications.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-56 pl-8"
              />
            </div>
            <ViewToggle value={view} onChange={setView} />
            <Button
              variant="outline"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <LoadingState label="Loading notifications…" />
          ) : query.isError ? (
            <ErrorState
              message={extractApiError(query.error)}
              onRetry={() => query.refetch()}
            />
          ) : query.data && query.data.items.length > 0 ? (
            view === "table" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.items.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>
                        <SeverityBadge severity={n.severity} />
                      </TableCell>
                      <TableCell className="font-medium">{n.title}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {truncate(n.message, 80)}
                      </TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">
                        {n.type}
                      </TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">
                        {n.status}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(n.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDetail(n)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {query.data.items.map((n) => (
                  <Card
                    key={n.id}
                    className="cursor-pointer hover:shadow-md"
                    onClick={() => openDetail(n)}
                  >
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between">
                        <SeverityBadge severity={n.severity} />
                        <span className="text-xs text-muted-foreground">
                          {n.status}
                        </span>
                      </div>
                      <div className="font-semibold">{n.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {truncate(n.message, 120)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(n.createdAt)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <EmptyState title="No notifications" />
          )}

          {query.data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={query.data.total}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected ? formatDateTime(selected.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={selected.severity} />
                <span className="text-xs uppercase text-muted-foreground">
                  {selected.type} · {selected.status}
                </span>
              </div>
              <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                {selected.message}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
