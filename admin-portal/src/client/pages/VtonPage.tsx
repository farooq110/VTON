import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search, RefreshCw, Eye } from "lucide-react";
import { z } from "zod";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
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
import { DynamicForm } from "@/client/components/shared/DynamicForm";
import { VtonStatusBadge } from "@/client/components/shared/StatusBadges";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/client/components/shared/EmptyState";
import {
  apiGet,
  apiGetPaginated,
  apiPost,
  extractApiError,
} from "@/client/lib/api-client";
import { useToast } from "@/client/hooks/useToast";
import { useDebounced } from "@/client/hooks/useDebounced";
import { buildQuery, formatDateTime } from "@/client/lib/utils";
import { PAGE_SIZE, VTON_CATEGORIES, VTON_MODES } from "@/shared/constants";
import type { Franchise, VtonRequest, VtonStatus } from "@/shared/types";

const submitSchema = z.object({
  franchiseId: z.string().min(1, "Franchise is required"),
  modelImage: z.string().url("Must be a valid URL"),
  garmentImage: z.string().url("Must be a valid URL"),
  category: z.enum(VTON_CATEGORIES),
  mode: z.enum(VTON_MODES),
});
type SubmitValues = z.infer<typeof submitSchema>;

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
];

export default function VtonPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [view, setView] = useState<ViewMode>("table");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<VtonRequest | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ["vton", page, debouncedSearch, status],
    queryFn: () =>
      apiGetPaginated<VtonRequest>(
        `/vton/list${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
        })}`,
      ),
    placeholderData: (prev) => prev,
  });

  // Auto-refresh when there are in-flight requests
  const hasInflight = (query.data?.items ?? []).some(
    (r) => r.status === "pending" || r.status === "processing" || r.status === "queued",
  );
  useEffect(() => {
    if (!hasInflight) return;
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["vton"] });
    }, 5000);
    return () => clearInterval(id);
  }, [hasInflight, qc]);

  async function onSubmit(values: SubmitValues) {
    setSaving(true);
    try {
      await apiPost("/vton/tryon", values);
      toast.success("Try-on submitted");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["vton"] });
    } catch (e) {
      toast.error(extractApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Try-On Requests</CardTitle>
            <p className="text-sm text-muted-foreground">
              Submit and monitor virtual try-on jobs.
              {hasInflight && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary">
                  <RefreshCw className="h-3 w-3 animate-spin" /> auto-refreshing 5s
                </span>
              )}
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
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value || "all"} value={s.value || "all"}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ViewToggle value={view} onChange={setView} />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New tryon
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <LoadingState label="Loading try-on requests…" />
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
                    <TableHead>Franchise</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.franchise?.name ?? "—"}
                      </TableCell>
                      <TableCell className="capitalize">{r.category}</TableCell>
                      <TableCell className="capitalize">{r.mode}</TableCell>
                      <TableCell>
                        <VtonStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {r.creditsCost}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreview(r)}
                          aria-label="Preview"
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
                {query.data.items.map((r) => (
                  <Card key={r.id} className="cursor-pointer hover:shadow-md" onClick={() => setPreview(r)}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">
                          {r.franchise?.name ?? "—"}
                        </div>
                        <VtonStatusBadge status={r.status} />
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {r.category} · {r.mode}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <EmptyState
              title="No try-on requests"
              description="Submit a new request to get started."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> New tryon
                </Button>
              }
            />
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New try-on request</DialogTitle>
            <DialogDescription>
              Submit a virtual try-on job. Customer is auto-derived from the
              franchise.
            </DialogDescription>
          </DialogHeader>
          <VtonSubmitForm saving={saving} onSubmit={onSubmit} onCancel={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Try-on details</DialogTitle>
            <DialogDescription>
              {preview?.franchise?.name} · {preview?.category} · {preview?.mode}
            </DialogDescription>
          </DialogHeader>
          {preview && <VtonPreview req={preview} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VtonSubmitForm({
  saving,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  onSubmit: (v: SubmitValues) => void;
  onCancel: () => void;
}) {
  const [franchiseId, setFranchiseId] = useState("");
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [loadingFranchises, setLoadingFranchises] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ items: Franchise[] }>("/franchises?page=1&pageSize=100")
      .then((r) => !cancelled && setFranchises(r.items ?? []))
      .catch(() => void 0)
      .finally(() => !cancelled && setLoadingFranchises(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedFranchise = franchises.find((f) => f.id === franchiseId);

  return (
    <DynamicForm
      schema={submitSchema}
      loading={saving}
      submitLabel="Submit try-on"
      onSubmit={(v) => onSubmit(v)}
      onCancel={onCancel}
      defaultValues={{
        franchiseId: "",
        modelImage: "",
        garmentImage: "",
        category: "tops",
        mode: "balanced",
      }}
      fields={[
        {
          name: "franchiseId",
          label: "Franchise",
          type: "select",
          required: true,
          options: franchises.map((f) => ({
            label: `${f.name}${f.customer ? ` — ${f.customer?.name ?? ""}` : ""}`,
            value: f.id,
          })),
          placeholder: loadingFranchises ? "Loading…" : "Select franchise",
          disabled: loadingFranchises,
        },
        {
          name: "_customer",
          label: "Customer (auto-derived)",
          type: "text",
          disabled: true,
          fullWidth: true,
        },
        {
          name: "modelImage",
          label: "Model image URL",
          type: "text",
          required: true,
          placeholder: "https://…/model.jpg",
          fullWidth: true,
        },
        {
          name: "garmentImage",
          label: "Garment image URL",
          type: "text",
          required: true,
          placeholder: "https://…/garment.jpg",
          fullWidth: true,
        },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: VTON_CATEGORIES.map((c) => ({ label: c, value: c })),
        },
        {
          name: "mode",
          label: "Mode",
          type: "select",
          options: VTON_MODES.map((m) => ({ label: m, value: m })),
        },
      ]}
      // Manual override so the customer field shows the derived customer.
      // DynamicForm will pass through `defaultValues._customer`.
      // (We're using setValue via the form internally — this is purely informational.)
    />
  );
}

function VtonPreview({ req }: { req: VtonRequest }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <VtonStatusBadge status={req.status} />
        <span className="text-sm text-muted-foreground">
          {formatDateTime(req.createdAt)}
        </span>
        <span className="text-sm font-medium">{req.creditsCost} credits</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ImagePreview label="Model" url={req.modelImage} />
        <ImagePreview label="Garment" url={req.garmentImage} />
      </div>

      {req.outputImages && req.outputImages.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Outputs</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {req.outputImages.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Output ${i + 1}`}
                className="aspect-square w-full rounded-md border object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {req.errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="font-medium">Error</div>
          <div className="mt-1 whitespace-pre-wrap">{req.errorMessage}</div>
        </div>
      )}
    </div>
  );
}

function ImagePreview({ label, url }: { label: string; url: string }) {
  const [err, setErr] = useState(false);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      {err ? (
        <div className="flex aspect-square items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
          Could not load image
        </div>
      ) : (
        <img
          src={url}
          alt={label}
          onError={() => setErr(true)}
          className="aspect-square w-full rounded-md border object-cover"
        />
      )}
      <div className="mt-1 truncate text-xs text-muted-foreground">{url}</div>
    </div>
  );
}
