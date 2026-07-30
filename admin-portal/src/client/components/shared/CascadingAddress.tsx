import { useEffect, useState } from "react";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Input } from "@/client/components/ui/input";
import { apiGet } from "@/client/lib/api-client";
import type { Customer, Franchise } from "@/shared/types";

interface CascadingAddressProps {
  value?: {
    customerId?: string;
    franchiseId?: string;
    line1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  onChange: (v: {
    customerId?: string;
    franchiseId?: string;
    line1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }) => void;
}

/**
 * Cascading customer → franchise → address picker. Customer selection drives
 * the franchise list (async via API).
 */
export function CascadingAddress({ value = {}, onChange }: CascadingAddressProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [franchises, setFranchises] = useState<Franchise[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ items: Customer[] }>(
      "/customers?page=1&pageSize=100",
    )
      .then((res) => {
        if (!cancelled) setCustomers(res.items ?? []);
      })
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!value.customerId) {
      setFranchises([]);
      return;
    }
    let cancelled = false;
    apiGet<{ items: Franchise[] }>(
      `/franchises?page=1&pageSize=100&customerId=${value.customerId}`,
    )
      .then((res) => {
        if (!cancelled) setFranchises(res.items ?? []);
      })
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [value.customerId]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Customer</Label>
        <Select
          value={value.customerId ?? ""}
          onValueChange={(v) =>
            onChange({ ...value, customerId: v, franchiseId: undefined })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.businessName})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Franchise</Label>
        <Select
          value={value.franchiseId ?? ""}
          onValueChange={(v) => onChange({ ...value, franchiseId: v })}
          disabled={!value.customerId}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select franchise" />
          </SelectTrigger>
          <SelectContent>
            {franchises.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 md:col-span-2">
        <Label>Address line</Label>
        <Input
          value={value.line1 ?? ""}
          onChange={(e) => onChange({ ...value, line1: e.target.value })}
          placeholder="123 Main St"
        />
      </div>

      <div className="space-y-1.5">
        <Label>City</Label>
        <Input
          value={value.city ?? ""}
          onChange={(e) => onChange({ ...value, city: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>State / Province</Label>
        <Input
          value={value.state ?? ""}
          onChange={(e) => onChange({ ...value, state: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Postal code</Label>
        <Input
          value={value.postalCode ?? ""}
          onChange={(e) => onChange({ ...value, postalCode: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Country</Label>
        <Input
          value={value.country ?? ""}
          onChange={(e) => onChange({ ...value, country: e.target.value })}
        />
      </div>
    </div>
  );
}
