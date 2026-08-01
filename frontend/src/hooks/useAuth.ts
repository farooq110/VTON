import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import apiClient from "@/lib/api-client";
import { useAuthStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import type { User } from "@/types";

/**
 * useAuth — single-step login hook.
 *
 * The client sends `{ identifier, password }` where `identifier` is either an
 * email address (e.g. "admin@atelier.nova") OR a franchise/user name (e.g.
 * "Atelier Nova NYC"). On success the server returns the standard envelope:
 *
 *   { success: true, data: { token, user }, message: "Signed in" }
 *
 * We unwrap `data.data` to get the `{ token, user }` payload, store the token
 * in localStorage (for the api-client's Authorization header), set the user
 * in the Zustand store (which flips `isAuthed` to true), then navigate to
 * /home.
 *
 * **Loose coupling:** the hook doesn't know HOW the server validates
 * credentials — it only posts to the endpoint and stores the result.
 *
 * **Diagnostic Logging:** sign-in attempts (success + failure) are logged via
 * the global `logger` utility (gated by `settings.debugLogging`).
 */
interface SignInPayload {
  token: string;
  user: User;
}

/** Backend envelope shape — every API response follows this. */
interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export function useAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const signIn = useMutation({
    mutationFn: async ({ identifier, password }: { identifier: string; password: string }) => {
      logger.auth("Sign-in attempt", { detail: `identifier: ${identifier}` });
      const { data } = await apiClient.post<Envelope<SignInPayload>>(
        "/auth/signin",
        { identifier, password },
      );
      // Defensive unwrap — tolerate both envelope shape AND bare payload
      // (so a future backend change doesn't silently break login).
      const payload: SignInPayload = (data as any)?.data ?? data;
      if (!payload?.token || !payload?.user) {
        throw new Error("Sign-in response was missing token or user.");
      }
      return payload;
    },
    onSuccess: (payload) => {
      localStorage.setItem("nova_token", payload.token);
      // Dispatch a custom event so the useHasToken hook in App.tsx picks up
      // the new token IMMEDIATELY (in the same tab). Without this, the
      // route guard still sees hasToken=false (localStorage.setItem doesn't
      // fire a 'storage' event in the SAME tab — only in other tabs) and
      // bounced the user back to /signin. A page refresh fixed it because
      // the hook's initializer re-read localStorage — but we don't want to
      // require a refresh.
      window.dispatchEvent(new CustomEvent("auth:token-set"));
      setUser(payload.user);
      logger.auth("Sign-in succeeded", { detail: `user: ${payload.user.email} · role: ${payload.user.role}` });
      // Defer the navigate to the next tick so the Zustand state update
      // (isAuthed = true) + the hasToken re-check flush before the route
      // guard re-evaluates.
      setTimeout(() => navigate("/home", { replace: true }), 0);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message ?? "Unknown error";
      logger.auth("Sign-in failed", { detail: msg, level: "error" });
    },
  });

  const signOut = useAuthStore((s) => s.signOut);

  return { signIn, signOut };
}
