import { NavLink } from "react-router-dom";
import {
  Activity,
  Bell,
  CreditCard,
  LayoutDashboard,
  Settings,
  Shirt,
  Store,
  Users,
  User,
  Gauge,
  X,
} from "lucide-react";
import { cn } from "@/client/lib/utils";
import { APP_NAME, ROUTES } from "@/shared/constants";
import { Button } from "@/client/components/ui/button";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { to: ROUTES.DASHBOARD, label: "Dashboard", icon: LayoutDashboard },
  { to: ROUTES.CUSTOMERS, label: "Customers", icon: Users },
  { to: ROUTES.FRANCHISES, label: "Franchises", icon: Store },
  { to: ROUTES.USAGE, label: "Usage", icon: Gauge },
  { to: ROUTES.VTON, label: "Try-On Requests", icon: Shirt },
  { to: ROUTES.PRICING, label: "Pricing", icon: CreditCard },
  { to: ROUTES.NOTIFICATIONS, label: "Notifications", icon: Bell },
  { to: ROUTES.ACTIVITY, label: "Activity", icon: Activity },
  { to: ROUTES.SETTINGS, label: "Settings", icon: Settings },
  { to: ROUTES.PROFILE, label: "Profile", icon: User },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/60 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Shirt className="h-4 w-4" />
            </div>
            {APP_NAME}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t p-3 text-xs text-muted-foreground">
          v0.1.0 · © {new Date().getFullYear()}
        </div>
      </aside>
    </>
  );
}
