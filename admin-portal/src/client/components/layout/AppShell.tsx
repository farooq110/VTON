import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/client/components/layout/Sidebar";
import { Topbar } from "@/client/components/layout/Topbar";
import { cn } from "@/client/lib/utils";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/customers": "Customers",
  "/franchises": "Franchises",
  "/usage": "Usage",
  "/vton": "Try-On Requests",
  "/pricing": "Pricing",
  "/notifications": "Notifications",
  "/activity": "Activity",
  "/settings": "Settings",
  "/profile": "Profile",
  "/demo": "Demo",
  "/demo/dashboard": "Demo Dashboard",
  "/signin": "Sign In",
};

interface AppShellProps {
  children?: React.ReactNode;
}

export function AppShell({ children }: AppShellProps = {}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile sidebar on route change.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Pick the page title from the route.
  const path = location.pathname;
  const title =
    TITLES[path] ??
    (path.startsWith("/customers/")
      ? "Customer"
      : path.startsWith("/usage/")
        ? "Usage Detail"
        : "Admin Portal");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] lg:pl-64",
        )}
      >
        <Topbar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
