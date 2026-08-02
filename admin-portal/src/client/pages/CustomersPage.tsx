import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
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
import { StatusBadge } from "@/client/components/shared/StatusBadges";
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
import { BUSINESS_TYPES, PAGE_SIZE } from "@/shared/constants";
import type { Customer } from "@/shared/types";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional().nullable(),
  businessName: z.string().min(1, "Business name is required"),
  businessType: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CHURNED", "TRIAL"]).optional(),
  notes: z.string().optional().nullable(),
});
type CustomerValues = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ["customers", page, debouncedSearch],
    queryFn: () =>
      apiGetPaginated<Customer>(
        `/customers${buildQuery({ page, pageSize: PAGE_SIZE, search: debouncedSearch })}`,
      ),
    placeholderData: (prev) => prev,
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/customers/${id}`),
    onSuccess: () => {
      toast.success("Customer deleted");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setDialogOpen(true);
  }

  async function onSubmit(values: CustomerValues) {
    setSaving(true);
    try {
      if (editing) {
        await apiPut(`/customers/${editing.id}`, values);
        toast.success("Customer updated");
      } else {
        await apiPost("/customers", values);
        toast.success("Customer created");
      }
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["customers"] });
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
            <CardTitle>Customers</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage customer accounts, contacts, and API access.
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
              <Plus className="h-4 w-4" /> New customer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <LoadingState label="Loading customers…" />
          ) : query.isError ? (
            <ErrorState
              message={extractApiError(query.error)}
              onRetry={() => query.refetch()}
            />
          ) : query.data && query.data.items.length > 0 ? (
            view === "table" ? (
              <CustomerTable
                items={query.data.items}
                onEdit={openEdit}
                onDelete={(c) =>
                  delMutation.mutate(c.id)
                }
              />
            ) : (
              <CustomerGrid items={query.data.items} onEdit={openEdit} />
            )
          ) : (
            <EmptyState
              title="No customers yet"
              description="Create your first customer to get started."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New customer
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
              {editing ? "Edit customer" : "New customer"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Update details for ${editing.name}.`
                : "Add a new customer account."}
            </DialogDescription>
          </DialogHeader>
          <DynamicForm
            schema={customerSchema}
            loading={saving}
            submitLabel={editing ? "Save changes" : "Create customer"}
            onSubmit={onSubmit}
            onCancel={() => setDialogOpen(false)}
            defaultValues={
              editing
                ? {
                    name: editing.name,
                    email: editing.email,
                    phone: editing.phone ?? "",
                    businessName: editing.businessName,
                    businessType: editing.businessType ?? "",
                    taxId: editing.taxId ?? "",
                    address: editing.address ?? "",
                    status: editing.status,
                    notes: editing.notes ?? "",
                  }
                : { status: "ACTIVE" }
            }
            fields={[
              { name: "name", label: "Contact name", type: "text", required: true },
              {
                name: "email",
                label: "Email",
                type: "email",
                required: true,
              },
              { name: "phone", label: "Phone", type: "tel" },
              {
                name: "businessName",
                label: "Business name",
                type: "text",
                required: true,
              },
              {
                name: "businessType",
                label: "Business type",
                type: "select",
                options: BUSINESS_TYPES.map((b) => ({ label: b, value: b })),
                placeholder: "Select type",
              },
              { name: "taxId", label: "Tax ID", type: "text" },
              {
                name: "address",
                label: "Address",
                type: "textarea",
                fullWidth: true,
              },
              {
                name: "status",
                label: "Status",
                type: "select",
                options: [
                  { label: "Active", value: "ACTIVE" },
                  { label: "Suspended", value: "SUSPENDED" },
                  { label: "Churned", value: "CHURNED" },
                  { label: "Trial", value: "TRIAL" },
                ],
              },
              {
                name: "notes",
                label: "Notes",
                type: "textarea",
                fullWidth: true,
              },
            ]}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerTable({
  items,
  onEdit,
  onDelete,
}: {
  items: Customer[];
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Business</TableHead>
            <TableHead className="whitespace-nowrap">Contact</TableHead>
            <TableHead className="whitespace-nowrap">Email</TableHead>
            <TableHead className="whitespace-nowrap">Phone</TableHead>
            <TableHead className="text-center whitespace-nowrap">Franchises</TableHead>
            <TableHead className="text-center whitespace-nowrap">API Keys</TableHead>
            <TableHead className="whitespace-nowrap">Status</TableHead>
            <TableHead className="whitespace-nowrap">Created</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
      <TableBody>
        {items.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.businessName}</TableCell>
            <TableCell>{c.name}</TableCell>
            <TableCell className="text-muted-foreground">{c.email}</TableCell>
            <TableCell className="text-muted-foreground whitespace-nowrap">
              {c.phone ?? "—"}
            </TableCell>
            <TableCell className="text-center">
              {c._count?.franchises ?? 0}
            </TableCell>
            <TableCell className="text-center">
              {c._count?.apiKeys ?? 0}
            </TableCell>
            <TableCell>
              <StatusBadge status={c.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(c.createdAt)}
            </TableCell>
            <TableCell>
              <RowMenu
                onEdit={() => onEdit(c)}
                onDelete={() => onDelete(c)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function CustomerGrid({
  items,
  onEdit,
}: {
  items: Customer[];
  onEdit: (c: Customer) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => (
        <Card
          key={c.id}
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => onEdit(c)}
        >
          <CardContent className="space-y-2 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{c.businessName}</div>
                <div className="text-xs text-muted-foreground">{c.name}</div>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <div className="text-sm text-muted-foreground">{c.email}</div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{c._count?.franchises ?? 0} franchises</span>
              <span>{c._count?.apiKeys ?? 0} keys</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem>API keys</DropdownMenuItem>
        <DropdownMenuItem>View pricing</DropdownMenuItem>
        <DropdownMenuItem>View franchises</DropdownMenuItem>
        <DropdownMenuItem>View usage</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Re-export for other pages
export type { CustomerValues };
export const _CustomerCardPlaceholder: ReactNode = null;
