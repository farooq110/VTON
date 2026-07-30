import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Moon, Sun, User as UserIcon } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/client/components/layout/Avatar";
import { useAuth } from "@/client/hooks/useAuth";
import { useTheme } from "@/client/hooks/useTheme";
import { initials } from "@/client/lib/utils";
import { ROUTES } from "@/shared/constants";

interface TopbarProps {
  title: string;
  onMenuClick: () => void;
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  const navigate = useNavigate();
  const { user, signout } = useAuth();
  const { theme, setTheme } = useTheme();

  async function handleSignout() {
    try {
      await signout();
    } catch {
      // ignore — UI bounces to /signin on 401
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <h1 className="flex-1 truncate text-base font-semibold md:text-lg">
        {title}
      </h1>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() =>
          setTheme(theme === "dark" ? "light" : "dark")
        }
        aria-label="Toggle theme"
      >
        {theme === "dark" ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </Button>

      {/* Notifications */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        onClick={() => navigate(ROUTES.NOTIFICATIONS)}
      >
        <Bell className="h-5 w-5" />
      </Button>

      {/* Profile menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar>
              <AvatarFallback>{initials(user?.name)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">
                {user?.name ?? "Guest"}
              </span>
              <span className="text-xs text-muted-foreground">
                {user?.email ?? "—"}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate(ROUTES.PROFILE)}>
            <UserIcon className="h-4 w-4" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSignout}>
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
