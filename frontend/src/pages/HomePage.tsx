import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowUp,
  Camera as CameraIcon,
  Home as HomeIcon,
  Image as ImageIcon,
  LogOut,
  Menu,
  Settings,
  Shirt,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBrand, useProducts } from "@/hooks/useProducts";
import { useAuthStore } from "@/lib/store";
import { resolveAssetUrl } from "@/lib/utils";
import { canAccessSettings, ROLE_LABELS } from "@/types";
import { TrendingProducts } from "@/components/home/TrendingProducts";
import { useHiddenLogout } from "@/hooks/useHiddenLogout";
import { useToast } from "@/components/ui/toast";

/**
 * HomePage — boutique landing page (synced with the Next.js preview's
 * HomeScreen.tsx, adapted for the original frontend's react-router + TanStack
 * Query + Zustand-auth-store stack).
 *
 * Layout (ALL screen sizes — mobile, tablet, desktop, kiosk):
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Header (shrink-0) — hamburger menu on ALL screens        │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  Cover banner — FULL BLEED, no padding/margin/radius     │
 *   │  Spans the entire viewport width on every screen         │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  Trending products list — flex-1, fills remaining space  │
 *   │  Internal scroll only — the page itself never scrolls    │
 *   │  Infinite scroll via IntersectionObserver                │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  Footer — pinned at the bottom, always visible           │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Role-aware:
 *   - public_user sees NO role badge, NO Settings menu entry, NO Sign out.
 *   - Managers / developers / admins see Settings + Sign out.
 *
 * Hidden long-press logout: holding the brand logo for 1.5s triggers
 * signOut + redirect to /signin. Casual taps do nothing visible.
 */
export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  // TanStack Query — fetches brand + products and mirrors them into the store.
  const { data: brand } = useBrand();
  useProducts();

  // Synchronous reads from the auth store (populated by the hooks above).
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const products = useAuthStore((s) => s.products);

  const showSettings = canAccessSettings(user?.role);
  const isPublicUser = user?.role === "public_user";
  // Defensive: ensure products is always an array before .filter
  const safeProducts = Array.isArray(products) ? products : [];
  const newArrivalsCount = safeProducts.filter((p) => p.isNew).length;

  // Brand identity — manager's custom overrides take priority over defaults.
  // resolveAssetUrl returns null for empty strings so the <img> never gets
  // an empty src attribute (which triggers a browser warning + re-download).
  const coverImage = resolveAssetUrl(brand?.customCoverBannerUrl) ?? resolveAssetUrl(brand?.coverBannerUrl);
  const brandName = brand?.customName ?? brand?.name ?? "Atelier Nova";
  const logoUrl = resolveAssetUrl(brand?.customLogoUrl) ?? resolveAssetUrl(brand?.logoUrl);

  // Slide-down menu — visible on ALL screen sizes on the home page.
  const [menuOpen, setMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { toast } = useToast();

  // Show the scroll-to-top button when the user has scrolled down more than
  // 400px. Hides when near the top so it doesn't cover content.
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const navTo = (path: string) => {
    // Spec: "it should not go to tryon camera page until it select garments"
    // If no product is selected, show a toast and KEEP THE MENU OPEN.
    if (path === "/tryon/camera") {
      const selectedId = useAuthStore.getState().selectedProductId;
      if (!selectedId) {
        toast({
          title: "Select a product first",
          description: "Browse the collection and pick a garment before opening the try-on camera.",
          variant: "destructive",
        });
        return; // don't close menu, don't navigate
      }
    }
    navigate(path);
    setMenuOpen(false);
  };

  const handleSignOut = () => {
    signOut();
    setMenuOpen(false);
    navigate("/signin");
  };

  // Hidden long-press logout on the brand logo (1.5s hold).
  const handleHiddenLogout = () => {
    signOut();
    navigate("/signin");
  };
  const brandLockupHandlers = useHiddenLogout(handleHiddenLogout);

  const goNewArrivals = () => navigate("/new-arrivals");
  const goProducts = () => navigate("/products");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header with hamburger menu — visible on ALL screen sizes.
          `relative` so the absolute-positioned dropdown menu anchors here.
          The page scrolls naturally; the header sticks to the top. */}
      <header className="relative sticky top-0 z-40 shrink-0 bg-background/95 backdrop-blur-md border-b border-border/40">
        <div className="px-3 sm:px-6 lg:px-10 py-3 sm:py-5 flex items-center justify-between gap-2">
          <BrandLockup
            logoUrl={logoUrl}
            name={brandName}
            hiddenLogoutHandlers={brandLockupHandlers}
          />
          <div className="flex items-center gap-2">
            {user && !isPublicUser && (
              <Badge className="hidden sm:inline-flex bg-transparent border border-border text-[10px] uppercase tracking-wider">
                {ROLE_LABELS[user.role]}
              </Badge>
            )}
            {/* Menu button — visible on ALL screen sizes */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen((o) => !o)}
              className="shrink-0 h-10 w-10"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Slide-down nav panel — OVERLAY (absolute positioned so it doesn't
            push the content below). Closes on any navigation action. */}
        <AnimatePresence>
          {menuOpen && (
            <>
              {/* Transparent backdrop — click anywhere to close */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <motion.nav
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-full left-0 right-0 z-50 overflow-hidden border-t border-border/40 bg-card shadow-elevated"
              >
                <div className="px-3 sm:px-6 lg:px-10 py-2 grid grid-cols-1 gap-1">
                  <MenuBtn icon={<HomeIcon className="h-4 w-4" />} label="Home" active={location.pathname === "/home"} onClick={() => navTo("/home")} />
                  <MenuBtn icon={<Shirt className="h-4 w-4" />} label="Collection" active={location.pathname === "/products" || location.pathname.startsWith("/products/")} onClick={() => navTo("/products")} />
                  <MenuBtn icon={<CameraIcon className="h-4 w-4" />} label="Try-on camera" active={location.pathname === "/tryon/camera" || location.pathname === "/tryon/processing" || location.pathname === "/tryon/result"} onClick={() => navTo("/tryon/camera")} />
                  <MenuBtn icon={<ImageIcon className="h-4 w-4" />} label="Captures gallery" active={location.pathname === "/captures-gallery"} onClick={() => navTo("/captures-gallery")} />
                  <MenuBtn icon={<ImageIcon className="h-4 w-4" />} label="Try-on results" active={location.pathname === "/tryon-results"} onClick={() => navTo("/tryon-results")} />
                  <MenuBtn icon={<Tag className="h-4 w-4" />} label="New arrivals" active={location.pathname === "/new-arrivals"} onClick={() => navTo("/new-arrivals")} />
                  {showSettings && (
                    <MenuBtn icon={<Settings className="h-4 w-4" />} label="Settings" active={location.pathname === "/settings"} onClick={() => navTo("/settings")} />
                  )}
                  {!isPublicUser && (
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition hover:bg-destructive/10 text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  )}
                </div>
              </motion.nav>
            </>
          )}
        </AnimatePresence>
      </header>

      {/*
        Cover banner — FULL BLEED at ALL breakpoints.
        NO padding, NO margin, NO border radius.
        The image consumes the entire viewport width edge-to-edge.
      */}
      <section className="shrink-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full overflow-hidden grain-overlay"
        >
          {/*
            Aspect ratio — shorter on small screens so the trending list has
            room to show. Wider screens get the ultrawide banner.
            - Mobile / tablet / lg desktop: 16/9
            - xl (1280+): 2.8/1 ultrawide
          */}
          <div className="relative w-full aspect-[3/4] sm:aspect-[16/9] lg:aspect-[16/9] xl:aspect-[2.8/1]">
            {coverImage ? (
              <img
                src={coverImage}
                alt={`${brandName} cover banner`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-accent/40" />
            )}
          </div>

          {/* Dark gradient overlay for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/40 to-foreground/20" />

          {/* Content overlay */}
          <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-10 lg:p-12 xl:p-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-accent/20 text-accent px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs uppercase tracking-[0.2em] backdrop-blur-sm w-fit">
                <Sparkles className="h-3 w-3" /> {brand?.tagline ?? "Try then Buy"}
              </div>

              <h1 className="mt-3 sm:mt-5 font-display text-2xl sm:text-5xl lg:text-5xl xl:text-6xl font-light text-primary-foreground leading-[1.05] text-balance">
                Wear it before
                <br />
                <span className="italic text-accent">you own it.</span>
              </h1>

              <p className="mt-3 sm:mt-5 text-primary-foreground/70 text-xs sm:text-base max-w-md leading-relaxed">
                Experience the collection from every angle. Capture yourself, see how each garment falls, then decide — try, then buy.
              </p>

              <div className="mt-4 sm:mt-7 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
                <Button
                  size="lg"
                  onClick={goProducts}
                  className="gap-2 group text-sm sm:text-base h-12 px-5 sm:px-7 w-full sm:w-auto"
                >
                  Explore products
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={goNewArrivals}
                  className="gap-2 bg-background/10 backdrop-blur-md border-background/20 text-primary-foreground hover:bg-background/20 hover:text-primary-foreground text-sm sm:text-base h-12 px-5 sm:px-7 w-full sm:w-auto"
                >
                  <Tag className="h-4 w-4" />
                  New arrivals ({newArrivalsCount})
                </Button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/*
        Trending products — the whole page scrolls naturally.
        The TrendingProducts header is `sticky top-[80px]` so it sticks under
        the main header when scrolled. The grid itself is part of the normal
        page flow — no internal scroll container.
      */}
      <section className="flex flex-col">
        <TrendingProducts className="" />
      </section>

      {/*
        Footer — pinned at the bottom, always visible.
        shrink-0 ensures it never gets squeezed by the trending list.
        bg-background so it stays opaque when the trending list scrolls behind it.
      */}
      <footer className="px-3 sm:px-6 lg:px-10 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 text-[10px] sm:text-xs text-muted-foreground shrink-0 bg-background">
        <span>© {new Date().getFullYear()} {brandName}. All rights reserved.</span>
        <span className="flex items-center gap-2 sm:gap-3">
          <span>v1.0 · Boutique Edition</span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline">Designed for 35″–85″ touch displays</span>
        </span>
      </footer>

      {/* Scroll-to-top floating button — appears when the user scrolls down
          more than 400px. Smooth-scrolls back to the top. Positioned
          bottom-right so it doesn't overlap the Activity overlay (bottom-right
          on desktop) — we put it bottom-left on large screens. */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={scrollToTop}
            className="fixed bottom-4 left-4 lg:left-auto lg:right-4 z-30 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-elevated grid place-items-center hover:bg-primary/90 transition"
            aria-label="Scroll to top"
          >
            <ArrowUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * BrandLockup — logo + wordmark. The whole lockup is wired to the hidden
 * long-press logout (1.5s hold → signOut). A normal tap/click does nothing
 * visible — the gesture is intentionally undiscoverable so a public kiosk
 * user can't accidentally trigger sign-out.
 */
function BrandLockup({
  logoUrl,
  name,
  hiddenLogoutHandlers,
}: {
  logoUrl: string | null;
  name: string;
  hiddenLogoutHandlers: {
    onMouseDown: () => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: () => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
}) {
  return (
    <div
      className="flex items-center gap-2 sm:gap-3 min-w-0 select-none"
      {...hiddenLogoutHandlers}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={`${name} logo`} className="h-8 sm:h-10 w-auto shrink-0" />
      ) : (
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-display italic text-sm sm:text-base shrink-0">
            N
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm sm:text-xl leading-none truncate">Atelier</p>
            <p className="font-display text-sm sm:text-xl italic text-accent leading-none truncate">Nova</p>
          </div>
        </div>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

/** MenuBtn — single nav entry inside the slide-down panel. Active item highlighted. */
function MenuBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
