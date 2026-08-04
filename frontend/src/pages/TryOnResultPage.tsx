import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { formatRelativeTime } from "@/lib/utils";

export function TryOnResultPage() {
  const navigate = useNavigate();
  const { lastResult, brandRequests, selectProduct, setActiveCapture } = useAuthStore();

  // Clear the session-scoped state (selected garment + active capture) so the
  // user starts fresh on the next try-on flow. `lastResult` is intentionally
  // kept — the user is actively viewing it on this page.
  const resetSessionState = useCallback(() => {
    selectProduct(null);
    setActiveCapture(null);
    sessionStorage.removeItem("nova_skip_stages");
  }, [selectProduct, setActiveCapture]);

  const tryAnother = () => {
    resetSessionState();
    navigate("/products");
  };

  const retakeCapture = () => {
    resetSessionState();
    navigate("/tryon/camera");
  };

  const goHome = () => {
    resetSessionState();
    navigate("/home");
  };

  if (!lastResult) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-full bg-accent/15 text-accent grid place-items-center mx-auto mb-5">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="font-display text-2xl font-medium">No fitting yet</h2>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Complete a try-on to see your virtual fitting here. Browse the collection and pick a piece to try on.
          </p>
          <button
            onClick={tryAnother}
            className="mt-6 px-6 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Browse collection
          </button>
        </div>
      </div>
    );
  }

  const lastBrandRequest = brandRequests[0];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 glass border-b border-border p-4 flex items-center gap-3">
        {/* Issue 5 fix — use the same ArrowLeft icon as GlobalHeader for consistency. */}
        <button onClick={tryAnother} aria-label="Back" className="shrink-0 h-10 w-10 grid place-items-center rounded-lg hover:bg-muted transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Your fitting</p>
          <h1 className="font-display text-lg truncate">SKU {lastResult.productSku}</h1>
        </div>
        <button onClick={goHome} className="text-sm text-foreground hover:text-primary transition font-medium">Close ✕</button>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <section className="relative bg-foreground">
          <div className="relative h-[55vh] lg:h-[calc(100vh-80px)]">
            <img src={lastResult.imageUrl} alt="Try-on result" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 to-transparent" />
          </div>
        </section>

        <aside className="flex flex-col bg-card p-6 sm:p-8 gap-6">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl">Fitting complete</h2>
            <p className="text-sm text-muted-foreground mt-2">Generated {formatRelativeTime(lastResult.createdAt)}.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={tryAnother} className="flex-1 h-12 rounded-xl border border-border">
              Try another
            </button>
            <button onClick={retakeCapture} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground">
              Retake
            </button>
          </div>
          {lastBrandRequest && (
            <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Brand request tracking</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Brand</span><span>{lastBrandRequest.brandId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Franchise</span><span>{lastBrandRequest.franchiseId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">SKU</span><span className="font-mono text-xs">{lastBrandRequest.productSku}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="text-primary">✓ Tracked</span></div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
