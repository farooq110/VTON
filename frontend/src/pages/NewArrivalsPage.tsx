import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useBrand } from "@/hooks/useProducts";
import { resolveAssetUrl } from "@/lib/utils";

/**
 * NewArrivalsPage — empty placeholder screen.
 *
 * The user spec says: "There should be new arrival section — create empty
 * screen, will decide logic later."
 *
 * This renders a clean, branded "coming soon" screen with:
 *   - The brand's logo + cover image as a faint backdrop
 *   - A friendly "New arrivals dropping soon" headline
 *   - A CTA to browse the current collection instead
 *
 * When the brand's merchandising logic for new arrivals is finalized, this
 * page can be replaced with a real grid (the TrendingProducts + ProductCard
 * pipeline is reusable — see components/home/TrendingProducts.tsx).
 */
export function NewArrivalsPage() {
  const navigate = useNavigate();
  const { data: brand } = useBrand();
  const brandName = brand?.customName ?? brand?.name ?? "Atelier Nova";
  const coverImage = resolveAssetUrl(brand?.customCoverBannerUrl) ?? resolveAssetUrl(brand?.coverBannerUrl);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader
        title="New arrivals"
        subtitle="Coming soon — fresh drops on the way"
        backTo="/home"
      />

      <main className="flex-1 relative overflow-hidden grid place-items-center px-4">
        {/* Faint backdrop — the brand's cover image, blurred + dimmed */}
        {coverImage && (
          <div className="absolute inset-0 pointer-events-none">
            <img
              src={coverImage}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover opacity-[0.08] blur-2xl scale-110"
            />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 max-w-lg text-center"
        >
          <div className="mx-auto h-24 w-24 rounded-full bg-accent/15 text-accent grid place-items-center mb-7 shadow-boutique">
            <Sparkles className="h-10 w-10" />
          </div>

          <p className="text-xs uppercase tracking-[0.3em] text-accent mb-3">
            {brandName} · Boutique Edition
          </p>

          <h1 className="font-display text-3xl sm:text-4xl font-light leading-tight text-balance">
            New arrivals dropping soon
          </h1>

          <p className="mt-5 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
            Our merchandising team is curating the next drop. In the meantime,
            explore our current collection — every piece is available for a
            virtual try-on.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => navigate("/products")}
              className="gap-2 w-full sm:w-auto"
            >
              <Tag className="h-4 w-4" />
              Browse collection
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/home")}
              className="gap-2 w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Button>
          </div>

          <p className="mt-10 text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Logic for this section is pending — placeholder screen
          </p>
        </motion.div>
      </main>
    </div>
  );
}
