import axios, { AxiosError } from "axios";

/**
 * Centralised API client. All backend calls go through here.
 * Auth token auto-injected; 401 → triggers a HARD sign-out that clears
 * token + persisted store + caches, then navigates to /signin.
 *
 * Swap base URL via VITE_API_BASE_URL env var (per-environment).
 *
 * ─── 401 HANDLING — BREAKING THE INFINITE REDIRECT LOOP ────────────────
 * PREVIOUSLY, on a 401 we only cleared `nova_token` and set
 * `window.location.href = "/signin"`. But the Zustand auth store is
 * persisted to localStorage under key `atelier-nova-tryon` and still had
 * `isAuthed: true` + `user: {...}`. So:
 *
 *   1. 401 → clear nova_token → navigate to /signin
 *   2. App.tsx route guard sees `isAuthed === true` (stale persisted state)
 *      → redirects to /home
 *   3. /home mounts → any API call has no token → 401 → back to /signin
 *   4. → infinite loop between /signin and /home → browser crashes
 *
 * FIX: On 401 we now do a HARD clear:
 *   - Remove `nova_token`
 *   - Remove the persisted Zustand store (`atelier-nova-tryon`) so
 *     `isAuthed` resets to `false` on next load.
 *   - Clear TanStack Query cache (via the window event the QueryClient
 *     listens for in App.tsx) so no stale data drives further navigation.
 *   - Use `window.location.replace("/signin")` (NOT `href`) so the
 *     current history entry is REPLACED — pressing Back doesn't bounce
 *     the user back into the loop.
 *   - The `replace()` triggers a full page reload, which re-creates the
 *     Zustand store from the now-empty localStorage → `isAuthed === false`
 *     → route guard lets the user stay on /signin.
 * ──────────────────────────────────────────────────────────────────────────
 */
const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export const apiClient = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("nova_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Track the last sign-out time so multiple concurrent 401s don't all try
// to redirect at once (which can race and re-enter).
let lastSignOutAt = 0;
const SIGN_OUT_COOLDOWN_MS = 2000;

/**
 * Hard sign-out — called from the 401 interceptor.
 *
 * Clears ALL auth state:
 *   1. `nova_token` from localStorage
 *   2. The entire persisted Zustand store key (`atelier-nova-tryon`)
 *   3. Dispatches a window event so TanStack Query can clear its cache
 *   4. Navigates to /signin via `location.replace()` (full reload)
 */
function hardSignOut(reason: string): void {
  const now = Date.now();
  if (now - lastSignOutAt < SIGN_OUT_COOLDOWN_MS) {
    // Already in the process of signing out — skip to avoid a redirect loop
    // between concurrent failed requests.
    return;
  }
  lastSignOutAt = now;

  // eslint-disable-next-line no-console
  console.warn(`[api-client] Hard sign-out triggered: ${reason}`);

  // 1. Remove the JWT token
  localStorage.removeItem("nova_token");

  // 2. Remove the entire persisted Zustand store so isAuthed resets to false.
  //    The store key is `atelier-nova-tryon` (defined in store.ts).
  localStorage.removeItem("atelier-nova-tryon");

  // 3. Notify the app to clear all in-memory caches (TanStack Query, etc.)
  //    App.tsx listens for this event and calls queryClient.clear().
  window.dispatchEvent(new CustomEvent("auth:hard-signout"));

  // 4. Navigate to /signin using replace() so:
  //    - The current history entry is replaced (no Back button loop)
  //    - A full page reload occurs (re-creates the store from empty localStorage)
  //    - If we're already on /signin, just reload to clear any stale state.
  if (!window.location.pathname.startsWith("/signin")) {
    window.location.replace("/signin");
  } else {
    // Already on /signin — force a reload to clear stale in-memory state
    window.location.reload();
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string; error?: { message?: string; code?: string } }>) => {
    const status = error.response?.status;

    if (status === 401) {
      // Token is missing, invalid, or expired. Hard-clear everything.
      const reason =
        error.response?.data?.error?.message ??
        error.response?.data?.message ??
        "Token expired or invalid";
      hardSignOut(reason);
    }

    return Promise.reject(error);
  },
);

export default apiClient;
