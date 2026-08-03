import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BrandedLoader } from "@/components/BrandedLoader";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import { ActivityLogPanel } from "@/components/tryon/ActivityLogPanel";
import { useAuthStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { warmDownloadedModels } from "@/hooks/usePoseDetection";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import apiClient from "@/lib/api-client";
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
    // Log every navigation to the activity log (excluding scroll events,
    // which are too noisy). This gives a full timeline of page visits.
    logger.navigation(`Navigated to ${pathname}`);
  }, [pathname]);
  return null;
}

/**
 * useHasToken — checks whether a JWT token is present in localStorage.
 *
 * This is the SECOND guard against the infinite redirect loop. Even if the
 * Zustand store says `isAuthed === true` (stale persisted state), if there's
 * no `nova_token` in localStorage, the user is NOT actually authenticated —
 * every API call will 401. By checking BOTH `isAuthed` AND the token, we
 * ensure the route guard lets the user stay on /signin when the token is
 * gone (expired, cleared, or DB changed server-side).
 *
 * The hook re-checks on every `popstate` and storage event so it stays in
 * sync across tabs.
 */
function useHasToken(): boolean {
  const [hasToken, setHasToken] = useState<boolean>(() => !!localStorage.getItem("nova_token"));

  useEffect(() => {
    const check = () => setHasToken(!!localStorage.getItem("nova_token"));
    check();
    // 'storage' fires in OTHER tabs when localStorage changes.
    window.addEventListener("storage", check);
    window.addEventListener("popstate", check);
    // Custom event fired by useAuth.signIn.onSuccess right after
    // localStorage.setItem("nova_token", ...) — this is how the SAME tab
    // learns that the token was just set (setItem doesn't fire 'storage'
    // in the same tab). Without this, the route guard still saw
    // hasToken=false after login and bounced the user back to /signin
    // until they manually refreshed the page.
    window.addEventListener("auth:token-set", check);
    // Custom event fired by the api-client 401 interceptor right before
    // it navigates to /signin.
    window.addEventListener("auth:hard-signout", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("popstate", check);
      window.removeEventListener("auth:token-set", check);
      window.removeEventListener("auth:hard-signout", check);
    };
  }, []);

  return hasToken;
}

/**
 * App router with mutual-exclusion route guards:
 *   - Unauthed → blocked from /private routes (sent to /signin).
 *   - Authed   → blocked from /auth routes (sent to /home).
 *
 * The guard checks BOTH:
 *   - `isAuthed` from the Zustand store (user-facing state)
 *   - `hasToken` from localStorage (the actual JWT presence)
 *
 * A route is only accessible when BOTH are true. This prevents the infinite
 * redirect loop that occurred when the store said authed but the token was
 * expired/missing (every API call 401'd and bounced the user back).
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
  const queryClient = useQueryClient();
  const hasToken = useHasToken();

  // The user is only considered truly authed when BOTH the store says so
  // AND a token is present in localStorage. If the token is gone (expired,
  // cleared by the 401 interceptor, or DB changed server-side), we treat
  // the user as unauthed — even if the persisted store still says authed.
  const effectivelyAuthed = isAuthed && hasToken;

  // Seed 3 dummy person images on first run so the captures gallery isn't empty.
  // Defensive guard: if the store was rehydrated from an old localStorage state
  // that doesn't have seedDummyCaptures, skip silently instead of crashing.
  useEffect(() => {
    if (effectivelyAuthed && typeof seedDummyCaptures === "function") seedDummyCaptures();
  }, [effectivelyAuthed, seedDummyCaptures]);

  // Issue 3 fix — fetch settings + brand from the server on auth. This
  // ensures the app always starts with the server's canonical state,
  // not the localStorage-persisted state (which may be stale if the user
  // changed settings on another device). The fetched settings overwrite
  // the store, which triggers ThemeApplier to apply the correct theme.
  useEffect(() => {
    if (!effectivelyAuthed) return;
    const fetchServerSettings = async () => {
      try {
        const [settingsRes, brandRes] = await Promise.allSettled([
          apiClient.get("/settings"),
          apiClient.get("/brand"),
        ]);
        // Unwrap the backend envelope: { success, data: { settings } }
        if (settingsRes.status === "fulfilled") {
          const body = settingsRes.value?.data;
          const inner = body?.data ?? body;
          const settings = inner?.settings ?? inner;
          if (settings && typeof settings === "object") {
            useAuthStore.getState().updateSettings(settings);
          }
        }
        // Unwrap: { success, data: { brand } }
        if (brandRes.status === "fulfilled") {
          const body = brandRes.value?.data;
          const inner = body?.data ?? body;
          const brand = inner?.brand ?? inner;
          if (brand && typeof brand === "object") {
            useAuthStore.getState().setBrand(brand);
          }
        }
      } catch {
        // Best-effort — if the server is unreachable, fall back to the
        // localStorage-persisted state (which is already in the store).
      }
    };
    fetchServerSettings();
  }, [effectivelyAuthed]);

  // Listen for the hard-signout event fired by the api-client 401 interceptor.
  // When fired, clear ALL TanStack Query caches so no stale data drives
  // further navigation or API calls. (The interceptor also clears
  // localStorage and navigates to /signin — this complements that by
  // clearing the in-memory query cache before the page reloads.)
  useEffect(() => {
    const onHardSignOut = () => {
      queryClient.clear();
    };
    window.addEventListener("auth:hard-signout", onHardSignOut);
    return () => window.removeEventListener("auth:hard-signout", onHardSignOut);
  }, [queryClient]);

  // On startup, WARM the worker's in-memory cache with all models marked as
  // downloaded in localStorage. If NO models are downloaded, auto-download
  // BOTH the default person-detection model AND the default posture model
  // so the app works out-of-the-box. This also triggers the transformers.js
  // CDN pre-load (the worker pre-loads it independently on startup).
  // By the time the user captures or uploads an image, everything is loaded —
  // detection time is just inference (<5s), no CDN downloads at capture time.
  useEffect(() => {
    warmDownloadedModels(
      DEFAULT_SETTINGS.personDetectionModelId,
      DEFAULT_SETTINGS.postureModelId,
    ).catch(() => {
      // Best-effort — swallow.
    });
  }, []);

  // Don't render any routes until the persisted state is rehydrated.
  // Issue 3 fix — use the reusable BrandedLoader (logo + app name) instead
  // of a bare spinner so the boot experience feels intentional + premium.
  if (!hydrated) {
    return <BrandedLoader variant="full" label="Loading…" sublabel="Preparing your boutique" />;
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ScrollToTop />
        <Suspense
          fallback={
            <BrandedLoader variant="full" label="Loading…" />
          }
        >
          <Routes>
            {/* Auth — only for unauthed users (no token OR store says not authed) */}
            <Route
              path="/signin"
              element={effectivelyAuthed ? <Navigate to="/home" replace /> : <SignInPage />}
            />
            <Route path="/passcode" element={<Navigate to="/signin" replace />} />

            {/* Private — only for truly authed users (store authed AND token present) */}
            <Route path="/home" element={effectivelyAuthed ? <HomePage /> : <Navigate to="/signin" replace />} />
            <Route path="/products" element={effectivelyAuthed ? <ProductsPage /> : <Navigate to="/signin" replace />} />
            <Route
              path="/products/:id"
              element={effectivelyAuthed ? <ProductDetailPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/new-arrivals"
              element={effectivelyAuthed ? <NewArrivalsPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon/camera"
              element={effectivelyAuthed ? <TryOnCameraPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon/processing"
              element={effectivelyAuthed ? <TryOnProcessingPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon/result"
              element={effectivelyAuthed ? <TryOnResultPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/captures-gallery"
              element={effectivelyAuthed ? <CapturesGalleryPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tryon-results"
              element={effectivelyAuthed ? <ResultsGalleryPage /> : <Navigate to="/signin" replace />}
            />
            <Route path="/settings" element={effectivelyAuthed ? <SettingsPage /> : <Navigate to="/signin" replace />} />

            <Route path="*" element={<Navigate to={effectivelyAuthed ? "/home" : "/signin"} replace />} />
          </Routes>
        </Suspense>

        {/* Global overlays — mounted once at the root */}
        <ActivityLogPanel />
        <Toaster />
      </ToastProvider>
    </ErrorBoundary>
  );
}
