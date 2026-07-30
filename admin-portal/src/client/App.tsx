import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/client/components/layout/AppShell";
import { Toaster } from "@/client/components/ui/toaster";
import { useAuth } from "@/client/hooks/useAuth";
import { useTheme } from "@/client/hooks/useTheme";
import { useEffect } from "react";
import { DEMO_ENABLED, ROUTES } from "@/shared/constants";

import SignInPage from "@/client/pages/SignInPage";
import DashboardPage from "@/client/pages/DashboardPage";
import CustomersPage from "@/client/pages/CustomersPage";
import FranchisesPage from "@/client/pages/FranchisesPage";
import UsagePage from "@/client/pages/UsagePage";
import VtonPage from "@/client/pages/VtonPage";
import PricingPage from "@/client/pages/PricingPage";
import NotificationsPage from "@/client/pages/NotificationsPage";
import ActivityPage from "@/client/pages/ActivityPage";
import SettingsPage from "@/client/pages/SettingsPage";
import ProfilePage from "@/client/pages/ProfilePage";
import DemoPage from "@/client/pages/DemoPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

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
    // Theme is applied inside useTheme — this component just guarantees
    // the hook is mounted at the root.
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
    element: DEMO_ENABLED ? <DemoPage /> : <Navigate to={ROUTES.SIGNIN} replace />,
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
      { path: ROUTES.CUSTOMERS, element: <CustomersPage /> },
      { path: "/customers/:id", element: <CustomersPage /> },
      { path: ROUTES.FRANCHISES, element: <FranchisesPage /> },
      { path: ROUTES.USAGE, element: <UsagePage /> },
      { path: "/usage/:customerId", element: <UsagePage /> },
      { path: ROUTES.VTON, element: <VtonPage /> },
      { path: ROUTES.PRICING, element: <PricingPage /> },
      { path: ROUTES.NOTIFICATIONS, element: <NotificationsPage /> },
      { path: ROUTES.ACTIVITY, element: <ActivityPage /> },
      { path: ROUTES.SETTINGS, element: <SettingsPage /> },
      { path: ROUTES.PROFILE, element: <ProfilePage /> },
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
