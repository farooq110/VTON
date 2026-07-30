import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, extractApiError } from "@/client/lib/api-client";
import type { AdminUser } from "@/shared/types";
import { toast } from "@/client/components/ui/toaster";

const ME_KEY = ["auth", "me"] as const;

export function useAuth() {
  const qc = useQueryClient();

  const meQuery = useQuery<AdminUser>({
    queryKey: ME_KEY,
    queryFn: () => apiGet<AdminUser>("/auth/me"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const signoutMutation = useMutation({
    mutationFn: () => apiPost("/auth/signout"),
    onSettled: () => {
      qc.setQueryData(ME_KEY, null);
      qc.clear();
      window.location.hash = "#/signin";
    },
  });

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    isError: meQuery.isError,
    refetch: meQuery.refetch,
    signout: () => signoutMutation.mutateAsync(),
    isAuthenticated: !!meQuery.data,
  };
}

export function useSignin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      apiPost<{ user: AdminUser }>("/auth/signin", vars),
    onSuccess: (data) => {
      qc.setQueryData(ME_KEY, data.user);
      // Navigate via hash so we don't need router access here.
      window.location.hash = "#/";
    },
    onError: (e) => {
      toast.error(extractApiError(e) || "Sign-in failed");
    },
  });
}
