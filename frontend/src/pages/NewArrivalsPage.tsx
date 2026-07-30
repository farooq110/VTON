import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/store";

/**
 * NewArrivalsPage — thin redirector that bounces the user to /products with
 * the `newArrivalsOnly: true` filter applied.
 *
 * Previously rendered its own dedicated grid, but that duplicated the entire
 * ProductCard + filter pipeline. Redirecting to the unified collection page
 * keeps a single source of truth for product browsing.
 *
 * The redirect happens immediately in a useEffect — no loading screen — so
 * the user goes straight to the filtered product list.
 */
export function NewArrivalsPage() {
  const navigate = useNavigate();
  const resetProductFilters = useAuthStore((s) => s.resetProductFilters);
  const setProductFilters = useAuthStore((s) => s.setProductFilters);

  useEffect(() => {
    resetProductFilters();
    setProductFilters({ newArrivalsOnly: true });
    navigate("/products", { replace: true });
  }, [navigate, resetProductFilters, setProductFilters]);

  // Render nothing — the redirect fires immediately on mount.
  return null;
}
