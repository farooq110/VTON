import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { AppShell } from "@/client/components/layout/AppShell";
import { Toaster } from "@/client/components/ui/toaster";
import { useAuth } from "@/client/hooks/useAuth";
import { useTheme } from "@/client/hooks/useTheme";
import { DEMO_ENABLED, ROUTES } from "@/shared/constants";

// Eagerly load critical pages (sign-in + dashboard + shell — needed for first paint)
import SignInPage from "@/client/pages/SignInPage";
import DashboardPage from "@/client/pages/DashboardPage";

// Lazy load all other pages — reduces initial bundle size significantly
const CustomersPage = lazy(() => import("@/client/pages/CustomersPage"));
const FranchisesPage = lazy(() => import("@/client/pages/FranchisesPage"));
const UsagePage = lazy(() => import("@/client/pages/UsagePage"));
const VtonPage = lazy(() => import("@/client/pages/VtonPage"));
const PricingPage = lazy(() => import("@/client/pages/PricingPage"));
const NotificationsPage = lazy(() => import("@/client/pages/NotificationsPage"));
const ActivityPage = lazy(() => import("@/client/pages/ActivityPage"));
const SettingsPage = lazy(() => import("@/client/pages/SettingsPage"));
const ProfilePage = lazy(() => import("@/client/pages/ProfilePage"));
const DemoPage = lazy(() => import("@/client/pages/DemoPage"));

// Query client with aggressive caching for performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000, // 5 min garbage collection
      placeholderData: (prev: unknown) => prev, // keep previous data while fetching
    },
  },
});

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.SIGNIN} replace />;
  }
  return <>{children}</>;
}

function ThemeBootstrap() {
  const { theme } = useTheme();
  useEffect(() => {
    void theme;
  }, [theme]);
  return null;
}

/** Demo dashboard — renders AppShell with the dashboard page as its child. */
function DemoDashboard() {
  return (
    <AppShell>
      <DashboardPage />
    </AppShell>
  );
}

const router = createHashRouter([
  {
    path: ROUTES.SIGNIN,
    element: <SignInPage />,
  },
  {
    path: ROUTES.DEMO,
    element: DEMO_ENABLED ? (
      <Suspense fallback={<PageLoader />}><DemoPage /></Suspense>
    ) : (
      <Navigate to={ROUTES.SIGNIN} replace />
    ),
  },
  {
    path: ROUTES.DEMO_DASHBOARD,
    element: DEMO_ENABLED ? <DemoDashboard /> : <Navigate to={ROUTES.SIGNIN} replace />,
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { path: ROUTES.DASHBOARD, element: <DashboardPage /> },
      { path: ROUTES.CUSTOMERS, element: <Suspense fallback={<PageLoader />}><CustomersPage /></Suspense> },
      { path: "/customers/:id", element: <Suspense fallback={<PageLoader />}><CustomersPage /></Suspense> },
      { path: ROUTES.FRANCHISES, element: <Suspense fallback={<PageLoader />}><FranchisesPage /></Suspense> },
      { path: ROUTES.USAGE, element: <Suspense fallback={<PageLoader />}><UsagePage /></Suspense> },
      { path: "/usage/:customerId", element: <Suspense fallback={<PageLoader />}><UsagePage /></Suspense> },
      { path: ROUTES.VTON, element: <Suspense fallback={<PageLoader />}><VtonPage /></Suspense> },
      { path: ROUTES.PRICING, element: <Suspense fallback={<PageLoader />}><PricingPage /></Suspense> },
      { path: ROUTES.NOTIFICATIONS, element: <Suspense fallback={<PageLoader />}><NotificationsPage /></Suspense> },
      { path: ROUTES.ACTIVITY, element: <Suspense fallback={<PageLoader />}><ActivityPage /></Suspense> },
      { path: ROUTES.SETTINGS, element: <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense> },
      { path: ROUTES.PROFILE, element: <Suspense fallback={<PageLoader />}><ProfilePage /></Suspense> },
    ],
  },
  {
    path: "*",
    element: <Navigate to={ROUTES.DASHBOARD} replace />,
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeBootstrap />
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
