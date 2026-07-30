import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles, X } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useAuthStore } from "@/lib/store";
import { searchProducts } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductTryOnModal } from "@/components/products/ProductTryOnModal";
import type { Product } from "@/types";

export function ProductsPage() {
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts();
  const { settings, selectProduct, productFilters, setProductFilters, resetProductFilters } = useAuthStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set((products ?? []).map((p) => p.category)))],
    [products],
  );
  const filtered = useMemo(() => {
    let list = searchProducts(products ?? [], query);
    if (category !== "all") list = list.filter((p) => p.category === category);
    // Store-side filters — applied by FiltersModal + NewArrivalsPage redirect.
    if (productFilters.newArrivalsOnly) list = list.filter((p) => p.isNew);
    if (productFilters.inStockOnly) list = list.filter((p) => p.inStock);
    if (productFilters.sizes.length > 0) {
      list = list.filter((p) => p.sizes.some((s) => productFilters.sizes.includes(s)));
    }
    if (productFilters.colors.length > 0) {
      list = list.filter((p) => p.colors.some((c) => productFilters.colors.includes(c.name)));
    }
    if (productFilters.priceMin !== null) list = list.filter((p) => p.price >= (productFilters.priceMin ?? 0));
    if (productFilters.priceMax !== null) list = list.filter((p) => p.price <= (productFilters.priceMax ?? Infinity));
    return list;
  }, [products, query, category, productFilters]);

  const handleTap = (product: Product) => {
    selectProduct(product.id);
    if (settings.productTapBehavior === "navigate") {
      navigate(`/products/${product.id}`);
    } else if (settings.productTapBehavior === "expand") {
      setExpandedId((cur) => (cur === product.id ? null : product.id));
    } else if (settings.productTapBehavior === "modal") {
      setModalProduct(product);
    }
  };

  const handleTryOn = (product?: Product) => {
    // If a product is passed (from the expanded card), select it.
    // Otherwise fall back to the already-selected product.
    if (product) selectProduct(product.id);
    setExpandedId(null);
    setModalProduct(null);
    navigate("/tryon/camera");
  };

  const handleViewDetails = () => {
    setExpandedId(null);
    setModalProduct(null);
    const selectedId = useAuthStore.getState().selectedProductId;
    if (selectedId) navigate(`/products/${selectedId}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader
        title={productFilters.newArrivalsOnly ? "New arrivals" : "Collection"}
        subtitle={`${filtered.length} ${filtered.length === 1 ? "piece" : "pieces"}${productFilters.newArrivalsOnly ? " · new drops" : " ready to try on"}`}
        backTo="/home"
      />

      {/* Search + category filter */}
      <div className="px-3 sm:px-6 lg:px-10 py-3 sm:py-4 flex flex-col sm:flex-row gap-2 sm:gap-3 bg-card/40 items-stretch">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, code, name…"
            className="pl-10 pr-10 h-12 text-base bg-background"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-12 sm:w-52 px-4 rounded-xl border border-border bg-background text-base"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
          ))}
        </select>
      </div>

      {/* Tap mode hint + active filter chips */}
      <div className="px-3 sm:px-6 lg:px-10 pb-2 flex flex-wrap items-center gap-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Tap mode: <span className="text-foreground font-medium">{settings.productTapBehavior}</span>
        </p>
        {productFilters.newArrivalsOnly && (
          <button
            onClick={() => setProductFilters({ newArrivalsOnly: false })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            <Sparkles className="h-3 w-3" /> New arrivals
            <X className="h-3 w-3" />
          </button>
        )}
        {productFilters.inStockOnly && (
          <button
            onClick={() => setProductFilters({ inStockOnly: false })}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/25 transition"
          >
            In stock
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Product grid — uses shared ProductCard */}
      <main className="flex-1 px-3 sm:px-6 lg:px-10 py-4 sm:py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">No pieces found</p>
            <Button onClick={() => { setQuery(""); setCategory("all"); resetProductFilters(); }} variant="ghost" className="mt-2">Clear filters</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
            {filtered.map((p, idx) => (
              <ProductCard
                key={p.id}
                product={p}
                index={idx}
                expanded={settings.productTapBehavior === "expand" && expandedId === p.id}
                onTap={() => handleTap(p)}
                onTryOn={() => handleTryOn(p)}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        )}
      </main>

      {/* Product try-on modal — shown when productTapBehavior === "modal" */}
      <ProductTryOnModal
        product={modalProduct}
        open={!!modalProduct}
        onClose={() => setModalProduct(null)}
        onTryOn={() => handleTryOn(modalProduct ?? undefined)}
        onViewDetails={handleViewDetails}
      />
    </div>
  );
}
