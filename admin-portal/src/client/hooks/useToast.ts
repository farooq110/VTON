import { toast } from "@/client/components/ui/toaster";
import { extractApiError } from "@/client/lib/api-client";

/**
 * Thin wrapper around sonner so the rest of the app never imports sonner
 * directly — swap implementations by editing this file only.
 */
export function useToast() {
  return {
    success: (msg: string, desc?: string) =>
      toast.success(msg, desc ? { description: desc } : undefined),
    error: (msg: string | unknown, desc?: string) =>
      toast.error(
        typeof msg === "string" ? msg : extractApiError(msg),
        desc ? { description: desc } : undefined,
      ),
    info: (msg: string, desc?: string) =>
      toast.info(msg, desc ? { description: desc } : undefined),
    warning: (msg: string, desc?: string) =>
      toast.warning(msg, desc ? { description: desc } : undefined),
    loading: (msg: string) => toast.loading(msg),
    dismiss: (id?: string) => toast.dismiss(id),
  };
}
