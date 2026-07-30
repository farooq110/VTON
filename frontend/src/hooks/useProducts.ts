import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { useAuthStore } from "@/lib/store";
import type { Brand, Product } from "@/types";

/**
 * Unwrap + guard helpers.
 *
 * The backend wraps every response in an envelope:
 *   GET /brand          → { brand: {...} }
 *   GET /products       → { products: [...], total, page, limit }
 *   GET /products/:id   → { product: {...} }
 *
 * These helpers tolerate BOTH the envelope shape AND a bare value (so the
 * frontend never crashes if the server changes its response shape). They also
 * tolerate null/undefined/string/number inputs by returning a safe fallback.
 */

function unwrapBrand(data: unknown): Brand | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const brand = (obj.brand ?? obj) as Record<string, unknown> | null;
  if (!brand || typeof brand !== "object") return null;
  return brand as unknown as Brand;
}

function unwrapProductList(data: unknown): Product[] {
  if (Array.isArray(data)) return data as Product[];
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const list = obj.products;
  if (Array.isArray(list)) return list as Product[];
  // Some servers may nest under `data` or `items` — tolerate both.
  if (Array.isArray(obj.data)) return obj.data as Product[];
  if (Array.isArray(obj.items)) return obj.items as Product[];
  return [];
}

function unwrapProduct(data: unknown): Product | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
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
