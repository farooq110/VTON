import axios, { AxiosError } from "axios";

/**
 * Centralised API client. All backend calls go through here.
 * Auth token auto-injected; 401 → triggers sign-out via the auth store.
 *
 * Swap base URL via VITE_API_BASE_URL env var (per-environment).
 */
const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export const apiClient = axios.create({
  baseURL,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("nova_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("nova_token");
      // Avoid router import cycle — just redirect
      if (!window.location.pathname.startsWith("/signin")) {
        window.location.href = "/signin";
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
