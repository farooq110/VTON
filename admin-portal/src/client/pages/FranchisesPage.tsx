import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MoreVertical, Search } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
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
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/client/components/shared/EmptyState";
import {
  apiDelete,
  apiGetPaginated,
  apiPost,
  apiPut,
  extractApiError,
} from "@/client/lib/api-client";
import { useToast } from "@/client/hooks/useToast";
import { useDebounced } from "@/client/hooks/useDebounced";
import { buildQuery, formatDate } from "@/client/lib/utils";
import { PAGE_SIZE } from "@/shared/constants";
import type { Franchise } from "@/shared/types";

const franchiseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  managerName: z.string().optional().nullable(),
  email: z.string().email("Valid email").optional().or(z.literal("")),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  customerId: z.string().min(1, "Customer is required"),
  status: z.string().optional(),
});
type FranchiseValues = z.infer<typeof franchiseSchema>;

interface FranchisesPageProps {
  customerId?: string;
}

export default function FranchisesPage({ customerId }: FranchisesPageProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Franchise | null>(null);
  const [saving, setSaving] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ["franchises", page, debouncedSearch, customerId],
    queryFn: () =>
      apiGetPaginated<Franchise>(
        `/franchises${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          customerId,
        })}`,
      ),
    placeholderData: (prev) => prev,
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/franchises/${id}`),
    onSuccess: () => {
      toast.success("Franchise deleted");
      qc.invalidateQueries({ queryKey: ["franchises"] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(f: Franchise) {
    setEditing(f);
    setDialogOpen(true);
  }

  async function onSubmit(values: FranchiseValues) {
    setSaving(true);
    try {
      // Normalize empty strings → undefined for optional fields
      const payload = {
        ...values,
        email: values.email || undefined,
      };
      if (editing) {
        await apiPut(`/franchises/${editing.id}`, payload);
        toast.success("Franchise updated");
      } else {
        await apiPost("/franchises", payload);
        toast.success("Franchise created");
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["franchises"] });
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
            <CardTitle>Franchises</CardTitle>
            <p className="text-sm text-muted-foreground">
              {customerId
                ? "Franchises for this customer."
                : "All franchises across customers."}
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
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New franchise
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <LoadingState label="Loading franchises…" />
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
                    <TableHead>Name</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.items.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>{f.managerName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.customer?.businessName ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">
                        {f.status ?? "active"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(f.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(f)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => delMutation.mutate(f.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {query.data.items.map((f) => (
                  <Card
                    key={f.id}
                    className="cursor-pointer hover:shadow-md"
                    onClick={() => openEdit(f)}
                  >
                    <CardContent className="space-y-1 p-4">
                      <div className="font-semibold">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.customer?.businessName ?? "—"}
                      </div>
                      <div className="text-sm">{f.managerName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.email ?? "—"}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <EmptyState
              title="No franchises yet"
              description="Create your first franchise."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New franchise
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit franchise" : "New franchise"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Update details for ${editing.name}.`
                : "Add a new franchise location."}
            </DialogDescription>
          </DialogHeader>
          <DynamicForm
            schema={franchiseSchema}
            loading={saving}
            submitLabel={editing ? "Save changes" : "Create franchise"}
            onSubmit={onSubmit}
            onCancel={() => setDialogOpen(false)}
            defaultValues={
              editing
                ? {
                    name: editing.name,
                    managerName: editing.managerName ?? "",
                    email: editing.email ?? "",
                    phone: editing.phone ?? "",
                    address: editing.address ?? "",
                    customerId: editing.customerId,
                    status: editing.status,
                  }
                : { customerId: customerId ?? "", status: "active" }
            }
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              { name: "managerName", label: "Manager", type: "text" },
              { name: "email", label: "Email", type: "email" },
              { name: "phone", label: "Phone", type: "tel" },
              {
                name: "address",
                label: "Address",
                type: "textarea",
                fullWidth: true,
              },
              {
                name: "customerId",
                label: "Customer",
                type: "async-select",
                required: true,
                endpoint: "/customers?page=1&pageSize=100",
                itemLabel: (c: any) => `${c.name} (${c.businessName})`,
                itemValue: (c: any) => c.id,
                placeholder: "Select customer",
              },
              {
                name: "status",
                label: "Status",
                type: "select",
                options: [
                  { label: "Active", value: "active" },
                  { label: "Inactive", value: "inactive" },
                ],
              },
            ]}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
