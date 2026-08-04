import { useNavigate, useParams } from "react-router-dom";
import { useProduct } from "@/hooks/useProducts";
import { useAuthStore } from "@/lib/store";
import { formatPrice, resolveProductImage, onImageError } from "@/lib/utils";

export function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: product, isLoading } = useProduct(id);
  const selectProduct = useAuthStore((s) => s.selectProduct);
  // Issue 4 fix — read currency from settings (default PKR).
  const currency = useAuthStore((s) => s.settings.currency);

  if (isLoading) return <div className="min-h-screen grid place-items-center bg-background"><p className="text-muted-foreground">Loading…</p></div>;
  if (!product) return <div className="min-h-screen grid place-items-center bg-background"><p>Not found.</p></div>;

  const handleTryOn = () => {
    // Select this product then go to camera — no "select garment first" message.
    selectProduct(product.id);
    navigate("/tryon/camera");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 glass border-b border-border p-4 sm:p-6 flex items-center gap-3">
        <button onClick={() => navigate("/products")}>←</button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{product.category}</p>
          <h1 className="font-display text-xl sm:text-2xl truncate">{product.name}</h1>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 sm:p-6 lg:p-10">
        <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-muted lg:sticky lg:top-24 lg:self-start lg:max-h-[80vh] lg:min-h-[400px]">
          <img src={resolveProductImage(product)} alt={product.name} onError={(e) => onImageError(e, product.sku)} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        </div>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-mono text-muted-foreground">{product.sku} · {product.code}</p>
            <h2 className="font-display text-3xl sm:text-4xl mt-2">{product.name}</h2>
            <p className="text-2xl font-semibold mt-3">{formatPrice(product.price, currency)}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Colours</p>
            <div className="flex gap-3">
              {product.colors.map((c) => (
                <span key={c.name} className="h-10 w-10 rounded-full border-2" style={{ backgroundColor: c.hex }} title={c.name} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Sizes</p>
            <div className="flex gap-2 flex-wrap">
              {product.sizes.map((s) => (
                <span key={s} className="min-w-[3rem] h-12 px-3 grid place-items-center border border-border rounded-xl text-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-accent/10 border border-accent/20 p-5">
            <p className="font-display text-lg">Try then buy</p>
            <p className="text-sm text-muted-foreground mt-1">See how this piece falls on you before you commit.</p>
          </div>
          <button
            onClick={handleTryOn}
            className="w-full h-14 rounded-xl bg-primary text-primary-foreground text-base font-medium"
          >
            TRY ON
          </button>
        </div>
      </main>
    </div>
  );
}
