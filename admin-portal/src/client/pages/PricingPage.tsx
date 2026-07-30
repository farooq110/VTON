import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Plus, Search, Trash2, Pencil } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Switch } from "@/client/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Label } from "@/client/components/ui/label";
import { ViewToggle, type ViewMode } from "@/client/components/shared/ViewToggle";
import { Pagination } from "@/client/components/shared/Pagination";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/client/components/shared/EmptyState";
import {
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPost,
  apiPut,
  extractApiError,
} from "@/client/lib/api-client";
import { useToast } from "@/client/hooks/useToast";
import { useDebounced } from "@/client/hooks/useDebounced";
import { useAppSettings } from "@/client/hooks/useAppSettings";
import { buildQuery, formatCurrency } from "@/client/lib/utils";
import { PAGE_SIZE } from "@/shared/constants";
import type { Customer, PricingTier } from "@/shared/types";

const tierSchema = z.object({
  startRange: z.coerce.number().int().nonnegative(),
  endRange: z.coerce.number().int().positive(),
  priceCents: z.coerce.number().int().nonnegative(),
  label: z.string().optional().nullable(),
  active: z.boolean().default(true),
});
type TierValues = z.infer<typeof tierSchema>;

export default function PricingPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { settings } = useAppSettings();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [managerCustomerId, setManagerCustomerId] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  const customers = useQuery({
    queryKey: ["customers", page, debouncedSearch],
    queryFn: () =>
      apiGetPaginated<Customer>(
        `/customers${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
        })}`,
      ),
    placeholderData: (prev) => prev,
  });

  // Fetch tiers for all loaded customers (one-by-one). Keep this loose for now.
  const tiersByCustomer = useQuery({
    queryKey: ["pricing", "by-customer", customers.data?.items.map((c) => c.id)],
    queryFn: async () => {
      const ids = customers.data?.items.map((c) => c.id) ?? [];
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const tiers = await apiGet<PricingTier[]>(`/customers/${id}/pricing`);
            return [id, tiers] as const;
          } catch {
            return [id, [] as PricingTier[]] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, PricingTier[]>;
    },
    enabled: !!customers.data?.items.length,
  });

  const clearAllMutation = useMutation({
    mutationFn: (customerId: string) =>
      apiPost(`/customers/${customerId}/pricing`, { tiers: [] as any }).catch(
        async () => {
          // backend requires ≥1 tier; fall back to a single disabled tier
          return apiPost(`/customers/${customerId}/pricing`, {
            tiers: [
              {
                startRange: 0,
                endRange: 1,
                priceCents: 0,
                label: "Cleared",
                active: false,
              },
            ],
          });
        },
      ),
    onSuccess: () => {
      toast.success("All tiers cleared");
      qc.invalidateQueries({ queryKey: ["pricing"] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Pricing</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage pricing tiers for each customer. Currency:{" "}
              <span className="font-medium">
                {settings.currencySymbol} {settings.currencyCode}
              </span>
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
          </div>
        </CardHeader>
        <CardContent>
          {customers.isLoading ? (
            <LoadingState label="Loading customers…" />
          ) : customers.isError ? (
            <ErrorState
              message={extractApiError(customers.error)}
              onRetry={() => customers.refetch()}
            />
          ) : customers.data && customers.data.items.length > 0 ? (
            view === "table" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-center">Tiers</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead>Price range</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.data.items.map((c) => {
                    const tiers = tiersByCustomer.data?.[c.id] ?? [];
                    const active = tiers.filter((t) => t.active);
                    const min = Math.min(...tiers.map((t) => t.priceCents), Infinity);
                    const max = Math.max(...tiers.map((t) => t.priceCents), -Infinity);
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => setManagerCustomerId(c.id)}
                      >
                        <TableCell className="font-medium">
                          {c.businessName}
                        </TableCell>
                        <TableCell className="text-center">
                          {tiers.length}
                        </TableCell>
                        <TableCell className="text-center">
                          {active.length}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tiers.length === 0
                            ? "—"
                            : `${formatCurrency(min, settings.currencySymbol, settings.currencyCode)} – ${formatCurrency(max, settings.currencySymbol, settings.currencyCode)}`}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setManagerCustomerId(c.id)}
                              >
                                Manage tiers
                              </DropdownMenuItem>
                              <DropdownMenuItem>Edit pricing</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => clearAllMutation.mutate(c.id)}
                              >
                                Clear all tiers
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {customers.data.items.map((c) => {
                  const tiers = tiersByCustomer.data?.[c.id] ?? [];
                  return (
                    <Card
                      key={c.id}
                      className="cursor-pointer hover:shadow-md"
                      onClick={() => setManagerCustomerId(c.id)}
                    >
                      <CardContent className="space-y-2 p-4">
                        <div className="font-semibold">{c.businessName}</div>
                        <div className="text-xs text-muted-foreground">
                          {tiers.length} tiers · {tiers.filter((t) => t.active).length} active
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
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

      <Dialog
        open={!!managerCustomerId}
        onOpenChange={(o) => !o && setManagerCustomerId(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage pricing tiers</DialogTitle>
            <DialogDescription>
              Add, edit, or remove tiers. Currency: {settings.currencySymbol}{" "}
              {settings.currencyCode}
            </DialogDescription>
          </DialogHeader>
          {managerCustomerId && (
            <PricingTierManager customerId={managerCustomerId} onClose={() => setManagerCustomerId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PricingTierManager({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { settings } = useAppSettings();
  const [editing, setEditing] = useState<TierValues | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const tiers = useQuery({
    queryKey: ["pricing", customerId],
    queryFn: () => apiGet<PricingTier[]>(`/customers/${customerId}/pricing`),
  });

  const saveMutation = useMutation({
    mutationFn: (newTiers: TierValues[]) =>
      apiPost<PricingTier[]>(`/customers/${customerId}/pricing`, {
        tiers: newTiers.map((t) => ({
          startRange: Number(t.startRange),
          endRange: Number(t.endRange),
          priceCents: Number(t.priceCents),
          label: t.label ?? null,
          active: !!t.active,
        })),
      }),
    onSuccess: () => {
      toast.success("Tiers saved");
      qc.invalidateQueries({ queryKey: ["pricing", customerId] });
      qc.invalidateQueries({ queryKey: ["pricing", "by-customer"] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  function openAdd() {
    setEditing({
      startRange: 0,
      endRange: 100,
      priceCents: 50,
      label: "",
      active: true,
    });
    setEditingIdx(null);
    setDialogOpen(true);
  }

  function openEdit(t: PricingTier, idx: number) {
    setEditing({
      startRange: t.startRange,
      endRange: t.endRange,
      priceCents: t.priceCents,
      label: t.label ?? "",
      active: t.active,
    });
    setEditingIdx(idx);
    setDialogOpen(true);
  }

  function saveTier(values: TierValues) {
    const list: TierValues[] = (tiers.data ?? []).map((t) => ({
      startRange: t.startRange,
      endRange: t.endRange,
      priceCents: t.priceCents,
      label: t.label ?? "",
      active: t.active,
    }));
    if (editingIdx === null) {
      list.push({
        ...values,
        label: values.label ?? "",
      });
    } else {
      list[editingIdx] = {
        ...values,
        label: values.label ?? "",
      };
    }
    saveMutation.mutate(list);
  }

  function toggleActive(idx: number) {
    const list = (tiers.data ?? []).map((t, i) => ({
      startRange: t.startRange,
      endRange: t.endRange,
      priceCents: t.priceCents,
      label: t.label ?? "",
      active: i === idx ? !t.active : t.active,
    }));
    saveMutation.mutate(list);
  }

  function removeTier(idx: number) {
    const list = (tiers.data ?? [])
      .filter((_, i) => i !== idx)
      .map((t) => ({
        startRange: t.startRange,
        endRange: t.endRange,
        priceCents: t.priceCents,
        label: t.label ?? "",
        active: t.active,
      }));
    if (list.length === 0) {
      toast.warning("At least one tier is required by the backend.");
      return;
    }
    saveMutation.mutate(list);
  }

  if (tiers.isLoading) return <LoadingState />;
  if (tiers.isError)
    return (
      <ErrorState
        message={extractApiError(tiers.error)}
        onRetry={() => tiers.refetch()}
      />
    );

  const items = tiers.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4" /> Add tier
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No tiers"
          description="Add your first pricing tier."
          action={
            <Button onClick={openAdd} size="sm">
              <Plus className="h-4 w-4" /> Add tier
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Range</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t, idx) => (
              <TableRow key={t.id ?? idx}>
                <TableCell>{t.label ?? "—"}</TableCell>
                <TableCell>
                  {t.startRange} – {t.endRange}
                </TableCell>
                <TableCell>
                  {formatCurrency(t.priceCents, settings.currencySymbol, settings.currencyCode)}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={t.active}
                    onCheckedChange={() => toggleActive(idx)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(t, idx)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTier(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingIdx === null ? "Add tier" : "Edit tier"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <TierForm
              defaultValues={editing}
              saving={saveMutation.isPending}
              onSubmit={saveTier}
              onCancel={() => setDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}

function TierForm({
  defaultValues,
  saving,
  onSubmit,
  onCancel,
}: {
  defaultValues: TierValues;
  saving: boolean;
  onSubmit: (v: TierValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<TierValues>(defaultValues);

  function set<K extends keyof TierValues>(k: K, v: TierValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={values.label ?? ""}
            onChange={(e) => set("label", e.target.value)}
            placeholder="e.g. Starter"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="active">Active</Label>
          <div className="flex items-center gap-3 pt-2">
            <Switch
              id="active"
              checked={!!values.active}
              onCheckedChange={(c) => set("active", c)}
            />
            <span className="text-sm text-muted-foreground">
              {values.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startRange">Start range</Label>
          <Input
            id="startRange"
            type="number"
            value={values.startRange}
            onChange={(e) => set("startRange", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endRange">End range</Label>
          <Input
            id="endRange"
            type="number"
            value={values.endRange}
            onChange={(e) => set("endRange", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="priceCents">Price (cents)</Label>
          <Input
            id="priceCents"
            type="number"
            value={values.priceCents}
            onChange={(e) => set("priceCents", Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save tier"}
        </Button>
      </div>
    </form>
  );
}
