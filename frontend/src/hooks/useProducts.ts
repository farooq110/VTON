import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { useAuthStore } from "@/lib/store";
import type { Brand, Product } from "@/types";

/**
 * Unwrap + guard helpers.
 *
 * The backend wraps every response in a standard envelope:
 *   { success: true, data: <payload>, message?: string }
 *
 * The payload itself is shape-specific:
 *   GET /brand          → data: { brand: {...} }
 *   GET /products       → data: { products: [...], total, page, pageSize }
 *   GET /products/:id   → data: { product: {...} }
 *
 * These helpers tolerate THREE shapes so the frontend never crashes if the
 * server response shape changes:
 *   1. Full envelope:      { success, data: { brand: {...} } }
 *   2. Bare inner payload: { brand: {...} }
 *   3. Bare value:         {...}  (the brand object itself)
 *
 * They also tolerate null/undefined/string/number inputs by returning a safe
 * fallback.
 */

/** Extracts the inner `data` payload from a backend envelope, if present. */
function unwrapEnvelope(maybe: unknown): unknown {
  if (!maybe || typeof maybe !== "object") return maybe;
  const obj = maybe as Record<string, unknown>;
  // If this looks like our envelope (has `success` boolean + `data` field),
  // return the inner `data`. Otherwise return the input as-is.
  if (typeof obj.success === "boolean" && "data" in obj) {
    return obj.data;
  }
  return maybe;
}

function unwrapBrand(data: unknown): Brand | null {
  const inner = unwrapEnvelope(data);
  if (!inner || typeof inner !== "object") return null;
  const obj = inner as Record<string, unknown>;
  // After envelope unwrap, the payload is `{ brand: {...} }`. Some legacy
  // responses may also return the brand directly.
  const brand = (obj.brand ?? obj) as Record<string, unknown> | null;
  if (!brand || typeof brand !== "object") return null;
  return brand as unknown as Brand;
}

function unwrapProductList(data: unknown): Product[] {
  const inner = unwrapEnvelope(data);
  if (Array.isArray(inner)) return inner as Product[];
  if (!inner || typeof inner !== "object") return [];
  const obj = inner as Record<string, unknown>;
  // After envelope unwrap, the payload is `{ products: [...], total, ... }`.
  const list = obj.products;
  if (Array.isArray(list)) return list as Product[];
  // Tolerate alternative field names from older / future response shapes.
  if (Array.isArray(obj.data)) return obj.data as Product[];
  if (Array.isArray(obj.items)) return obj.items as Product[];
  return [];
}

function unwrapProduct(data: unknown): Product | null {
  const inner = unwrapEnvelope(data);
  if (!inner || typeof inner !== "object") return null;
  const obj = inner as Record<string, unknown>;
  // After envelope unwrap, the payload is `{ product: {...} }`. Some legacy
  // responses may also return the product directly.
  const product = (obj.product ?? obj) as Record<string, unknown> | null;
  if (!product || typeof product !== "object") return null;
  return product as unknown as Product;
}

export function useBrand() {
  const setBrand = useAuthStore((s) => s.setBrand);
  return useQuery({
    queryKey: ["brand"],
    queryFn: async () => {
      const { data } = await apiClient.get("/brand");
      const brand = unwrapBrand(data);
      if (brand) setBrand(brand);
      return brand;
    },
    staleTime: 5 * 60_000,
  });
}

export function useProducts() {
  const setProducts = useAuthStore((s) => s.setProducts);
  const seedDummyProducts = useAuthStore((s) => s.seedDummyProducts);
  return useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/products");
        // Always normalize to a Product[] — never trust the server shape.
        const list = unwrapProductList(data);
        if (list.length === 0) {
          // Backend returned no products — seed dummies so the UI isn't empty.
          seedDummyProducts();
          return useAuthStore.getState().products;
        }
        setProducts(list);
        return list;
      } catch {
        // Backend unreachable — seed dummy products as fallback so the UI
        // is never empty. The dummy products have trending scores so the
        // home rail + products page work.
        seedDummyProducts();
        return useAuthStore.getState().products;
      }
    },
    retry: 1,
    staleTime: 60_000,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: async () => {
      if (!id) throw new Error("No product id");
      const { data } = await apiClient.get(`/products/${id}`);
      return unwrapProduct(data);
    },
    enabled: !!id,
  });
}
