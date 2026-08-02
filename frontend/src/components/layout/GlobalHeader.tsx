import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera as CameraIcon, Home as HomeIcon, Image as ImageIcon, LogOut, Menu, Settings as SettingsIcon, Shirt, Sparkles, Tag, X } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { canAccessSettings } from "@/types";
import { logger } from "@/lib/logger";
import { useToast } from "@/components/ui/toast";

/**
 * GlobalHeader — shared header on ALL screens.
 *
 * Features:
 *   - Back arrow (navigates to backTo or history back)
 *   - Title + subtitle
 *   - Right slot for buttons
 *   - Hamburger menu button (visible on ALL screen sizes) → OVERLAY nav
 *   - Nav entries: Home, Collection, Camera, Gallery, New arrivals, Settings, Sign out
 *   - Role-aware: public_user sees no Settings + no Sign out
 *
 * **Menu behavior:** The slide-down nav panel is `absolute top-full` positioned
 * (overlay) so it doesn't push the page content down. A transparent backdrop
 * closes the menu on outside click. Same pattern as the HomePage header.
 */
interface GlobalHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  rightSlot?: React.ReactNode;
}

export function GlobalHeader({ title, subtitle, showBack = true, backTo, rightSlot }: GlobalHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const showSettings = canAccessSettings(user?.role);
  const isPublicUser = user?.role === "public_user";
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast } = useToast();

  const handleBack = () => {
    logger.interaction("Back button clicked", { component: "GlobalHeader", detail: backTo ?? "history" });
    if (backTo) navigate(backTo);
    else navigate(-1);
  };

  const nav = (path: string) => {
    logger.interaction(`Nav menu: ${path}`, { component: "GlobalHeader" });
    // Issue 2 fix — if the user clicks "Try-on camera" without a selected
    // garment, show a FRIENDLY WARNING toast (not a red destructive error).
    // The user is just being reminded to pick a garment — that's an
    // info/warning situation, not an error. We keep the menu open so the
    // user can pick a different nav entry after seeing the toast.
    if (path === "/tryon/camera") {
      const selectedId = useAuthStore.getState().selectedProductId;
      if (!selectedId) {
        toast({
          title: "Please select a garment first",
          description: "Browse the collection and pick a garment before opening the try-on camera.",
          // No `variant: "destructive"` — friendly warning, not an error.
        });
        return;
      }
    }
    navigate(path);
    setMenuOpen(false);
  };

  const handleSignOut = () => {
    logger.interaction("Sign out clicked", { component: "GlobalHeader" });
    signOut();
    setMenuOpen(false);
    navigate("/signin");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="relative sticky top-0 z-40 glass border-b border-border/60">
      <div className="px-3 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
        {showBack && (
          <button
            onClick={handleBack}
            className="shrink-0 h-10 w-10 grid place-items-center rounded-lg hover:bg-muted transition"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          {subtitle && (
            <p className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
          <h1 className="font-display text-lg sm:text-2xl lg:text-3xl font-medium leading-tight truncate">
            {title}
          </h1>
        </div>

        {/* Right slot — for buttons like Settings, Filters */}
        <div className="flex items-center gap-2 shrink-0">
          {rightSlot}
        </div>

        {/* Menu button — visible on ALL screen sizes */}
        <button
          onClick={() => {
            logger.interaction(`Menu ${menuOpen ? "closed" : "opened"}`, { component: "GlobalHeader" });
            setMenuOpen((o) => !o);
          }}
          className="shrink-0 h-10 w-10 grid place-items-center rounded-lg hover:bg-muted transition"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Slide-down nav panel — OVERLAY (absolute positioned so it doesn't
          push the page content below). Closes on any navigation action. */}
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
                <MenuBtn icon={<HomeIcon className="h-4 w-4" />} label="Home" active={isActive("/home")} onClick={() => nav("/home")} />
                <MenuBtn icon={<Shirt className="h-4 w-4" />} label="Collection" active={isActive("/products")} onClick={() => nav("/products")} />
                <MenuBtn icon={<CameraIcon className="h-4 w-4" />} label="Try-on camera" active={isActive("/tryon/camera")} onClick={() => nav("/tryon/camera")} />
                <MenuBtn icon={<ImageIcon className="h-4 w-4" />} label="Captures gallery" active={isActive("/captures-gallery")} onClick={() => nav("/captures-gallery")} />
                <MenuBtn icon={<Sparkles className="h-4 w-4" />} label="Try-on results" active={isActive("/tryon-results")} onClick={() => nav("/tryon-results")} />
                <MenuBtn icon={<Tag className="h-4 w-4" />} label="New arrivals" active={isActive("/new-arrivals")} onClick={() => nav("/new-arrivals")} />
                {showSettings && (
                  <MenuBtn icon={<SettingsIcon className="h-4 w-4" />} label="Settings" active={isActive("/settings")} onClick={() => nav("/settings")} />
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
  );
}

function MenuBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
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
