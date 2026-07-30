import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, KeyRound, Lock, Sparkles, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/types";
import { ROLE_LABELS } from "@/types";

/**
 * SignInPage — single-step login.
 *
 * The user enters EITHER an email address OR a franchise name, plus a password.
 * The backend's /auth/signin endpoint auto-detects which one was supplied and
 * returns `{ token, user }` on success. The user is then redirected straight
 * to /home.
 *
 * Route guards in App.tsx enforce:
 *   - Unauthed users are blocked from /private routes (redirected to /signin).
 *   - Authed users are blocked from /auth routes (redirected to /home).
 */
export function SignInPage() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      setError("Please enter your email or franchise name.");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    try {
      await signIn.mutateAsync({ identifier: identifier.trim(), password });
      // onSuccess handler in useAuth navigates to /home
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Sign-in failed. Please try again.");
    }
  };

  const fillDemo = (idVal: string, pass: string) => {
    setIdentifier(idVal);
    setPassword(pass);
    setError(null);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Decorative split background */}
      <div className="pointer-events-none absolute inset-0 grid grid-cols-1 md:grid-cols-2">
        <div className="hidden md:block bg-gradient-to-br from-primary/90 via-primary to-primary/70 grain-overlay" />
        <div className="bg-background" />
      </div>

      <div className="relative z-10 min-h-screen grid grid-cols-1 md:grid-cols-2">
        {/* Brand side */}
        <aside className="hidden md:flex flex-col justify-between p-12 text-primary-foreground">
          <BrandMark />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-md"
          >
            <p className="text-xs uppercase tracking-[0.4em] opacity-70 mb-4">Spring · Summer 25</p>
            <h1 className="font-display text-5xl xl:text-6xl font-light leading-tight text-balance">
              Wear it before <span className="italic text-accent">you own it.</span>
            </h1>
            <p className="mt-6 text-base opacity-80 leading-relaxed">
              Atelier Nova brings the fitting room to your screen. Capture, preview, and try on every piece from the collection — virtually, beautifully, instantly.
            </p>
          </motion.div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] opacity-60">
            <Sparkles className="h-3 w-3" />
            <span>Powered by Nova TryOn AI</span>
          </div>
        </aside>

        {/* Form side */}
        <main className="flex items-center justify-center p-6 sm:p-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full max-w-md"
          >
            <div className="md:hidden mb-10">
              <BrandMark dark />
            </div>

            <h2 className="font-display text-3xl font-medium text-foreground">Sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your email or franchise name and password to continue.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Email or Franchise Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    placeholder="admin@atelier.nova or Atelier Nova NYC"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="pl-10 h-12 bg-background border-border"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use either your email address or your franchise location name.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12 bg-background border-border"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={signIn.isPending}
                className="w-full h-12 text-base gap-2 group"
              >
                {signIn.isPending ? "Signing in…" : "Sign in"}
                {!signIn.isPending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </Button>
            </form>

            {/* Demo credentials */}
            <div className="mt-8 rounded-xl bg-muted/50 border border-border/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" /> Demo credentials — tap to fill
              </p>
              <div className="space-y-2">
                <DemoRow role="super_admin" identifier="admin@atelier.nova" pass="admin123" onFill={fillDemo} />
                <DemoRow role="developer" identifier="developer@atelier.nova" pass="dev123" onFill={fillDemo} />
                <DemoRow role="manager" identifier="nyc.manager@atelier.nova" pass="manager123" onFill={fillDemo} />
                <DemoRow role="public_user" identifier="nyc.user@atelier.nova" pass="user123" onFill={fillDemo} />
              </div>
              <div className="mt-3 pt-3 border-t border-border/40">
                <p className="text-[10px] text-muted-foreground">
                  Or sign in by franchise name: <span className="font-mono">Atelier Admin</span> / <span className="font-mono">admin123</span>
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs text-muted-foreground text-center">
              By signing in you agree to Atelier Nova&apos;s terms of use and privacy policy.
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function DemoRow({
  role,
  identifier,
  pass,
  onFill,
}: {
  role: Role;
  identifier: string;
  pass: string;
  onFill: (i: string, p: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFill(identifier, pass)}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border border-border/60 hover:border-primary/40 transition text-left"
    >
      <div className="flex items-center gap-2 min-w-0">
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-mono truncate">{identifier} · {pass}</p>
          <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[role]}</p>
        </div>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-accent shrink-0">Fill</span>
    </button>
  );
}

function BrandMark({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-10 w-10 rounded-full grid place-items-center ${dark ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
        <span className="font-display text-lg italic">N</span>
      </div>
      <div className={dark ? "text-foreground" : "text-primary-foreground"}>
        <p className="font-display text-xl leading-none">Atelier</p>
        <p className="font-display text-xl italic text-accent leading-none">Nova</p>
      </div>
    </div>
  );
}
