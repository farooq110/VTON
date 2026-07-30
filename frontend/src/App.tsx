import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import { ActivityLogPanel } from "@/components/tryon/ActivityLogPanel";
import { useAuthStore } from "@/lib/store";
import { SignInPage } from "@/pages/SignInPage";
import { HomePage } from "@/pages/HomePage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { NewArrivalsPage } from "@/pages/NewArrivalsPage";
import { TryOnCameraPage } from "@/pages/TryOnCameraPage";
import { TryOnProcessingPage } from "@/pages/TryOnProcessingPage";
import { TryOnResultPage } from "@/pages/TryOnResultPage";
import { SettingsPage } from "@/pages/SettingsPage";

// Code-split the gallery pages — they pull in pose-detection + image
// compression deps that aren't needed on the critical path.
const CapturesGalleryPage = lazy(() =>
  import("@/pages/CapturesGalleryPage").then((m) => ({ default: m.CapturesGalleryPage })),
);
const ResultsGalleryPage = lazy(() =>
  import("@/pages/ResultsGalleryPage").then((m) => ({ default: m.ResultsGalleryPage })),
);

/**
 * ScrollToTop — scrolls the window back to the top on every route change.
 * Without this, navigating from a long page (e.g. /products) to a short
 * page (e.g. /home) leaves the user looking at the middle of the new page.
 *
 * Also briefly locks body scroll during the transition so the new page
 * settles before the user can scroll it.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

/**
 * App router with mutual-exclusion route guards:
 *   - Unauthed → blocked from /private routes (sent to /signin).
 *   - Authed   → blocked from /auth routes (sent to /home).
 *
 * Wrapped in ErrorBoundary + ToastProvider so any render-time error in a
 * route page shows a friendly fallback instead of a blank white screen,
 * and so any `useToast()` call inside the tree has a live provider.
 *
 * ActivityLogPanel is mounted once at the root — it self-gates on
 * `settings.debugLogging` + `canViewActivityLog(role)`, so it stays
 * invisible in production for public users.
 */
export default function App() {
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const hydrated = useAuthStore((s) => s._hydrated);
  const seedDummyCaptures = useAuthStore((s) => s.seedDummyCaptures);

  // Seed 3 dummy person images on first run so the captures gallery isn't empty.
  // Defensive guard: if the store was rehydrated from an old localStorage state
  // that doesn't have seedDummyCaptures, skip silently instead of crashing.
  useEffect(() => {
    if (isAuthed && typeof seedDummyCaptures === "function") seedDummyCaptures();
  }, [isAuthed, seedDummyCaptures]);

  // Don't render any routes until the persisted state is rehydrated.
  // Without this, the user briefly sees /signin before being redirected
  // to /home (because isAuthed is false during the hydration window).
  if (!hydrated) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Loading Atelier Nova…</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ScrollToTop />
        <Suspense
          fallback={
            <div className="min-h-screen grid place-items-center bg-background">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          }
        >
          <Routes>
            {/* Auth — only for unauthed users */}
            <Route path="/signin" element={isAuthed ? <Navigate to="/home" replace /> : <SignInPage />} />
            <Route path="/passcode" element={<Navigate to="/signin" replace />} />

            {/* Private — only for authed users */}
            <Route path="/home" element={isAuthed ? <HomePage /> : <Navigate to="/signin" replace />} />
            <Route path="/products" element={isAuthed ? <ProductsPage /> : <Navigate to="/signin" replace />} />
            <Route
              path="/products/:id"
              element={isAuthed ? <ProductDetailPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/new-arrivals"
              element={isAuthed ? <NewArrivalsPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon/camera"
              element={isAuthed ? <TryOnCameraPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon/processing"
              element={isAuthed ? <TryOnProcessingPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon/result"
              element={isAuthed ? <TryOnResultPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/captures-gallery"
              element={isAuthed ? <CapturesGalleryPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon-results"
              element={isAuthed ? <ResultsGalleryPage /> : <Navigate to="/signin" replace />}
            />
            <Route path="/settings" element={isAuthed ? <SettingsPage /> : <Navigate to="/signin" replace />} />

            <Route path="*" element={<Navigate to={isAuthed ? "/home" : "/signin"} replace />} />
          </Routes>
        </Suspense>

        {/* Global overlays — mounted once at the root */}
        <ActivityLogPanel />
        <Toaster />
      </ToastProvider>
    </ErrorBoundary>
  );
}
