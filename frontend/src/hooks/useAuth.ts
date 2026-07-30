import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import apiClient from "@/lib/api-client";
import { useAuthStore } from "@/lib/store";
import type { User } from "@/types";

/**
 * useAuth — single-step login hook.
 *
 * The client sends `{ identifier, password }` where `identifier` is either an
 * email address (e.g. "admin@atelier.nova") OR a franchise/user name (e.g.
 * "Atelier Nova NYC"). On success the server returns `{ token, user }` and the
 * user is redirected straight to /home. There is no passcode step.
 */
interface SignInResponse {
  token: string;
  user: User;
}

export function useAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const signIn = useMutation({
    mutationFn: async ({ identifier, password }: { identifier: string; password: string }) => {
      const { data } = await apiClient.post<SignInResponse>("/auth/signin", { identifier, password });
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem("nova_token", data.token);
      setUser(data.user);
      navigate("/home");
    },
  });

  const signOut = useAuthStore((s) => s.signOut);

  return { signIn, signOut };
}
