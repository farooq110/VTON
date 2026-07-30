import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/lib/store";

/**
 * RouteGuard — wraps any private route.
 * - Unauthed user → redirect to /signin.
 * - Authed user trying to reach an auth route → redirect to /home.
 */
export function RouteGuard({ children, requireAuth = true }: { children: React.ReactNode; requireAuth?: boolean }) {
  const isAuthed = useAuthStore((s) => s.isAuthed);

  if (requireAuth && !isAuthed) return <Navigate to="/signin" replace />;
  if (!requireAuth && isAuthed) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
