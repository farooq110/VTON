/**
 * Shared constants used by both client and server.
 * No framework imports here — kept pure so SSR can also pull these in.
 */

// Use a RELATIVE path ("/api") by default so the browser makes same-origin
// requests. In dev, Vite proxies /api → http://localhost:4000. In prod, Nginx
// proxies /api → the backend. This avoids CORS issues and works in preview
// environments where the browser can't reach the backend's localhost.
//
// Set VITE_API_URL to an absolute URL ONLY if the frontend and backend are on
// different origins in production (e.g. Vercel frontend + Railway backend).
export const API_URL =
  (import.meta?.env?.VITE_API_URL as string | undefined) || "/api";

export const APP_NAME =
  (import.meta?.env?.VITE_APP_NAME as string | undefined) || "Admin Portal";

export const DEMO_ENABLED =
  ((import.meta?.env?.VITE_DEMO_ENABLED as string | undefined) ?? "true") !==
  "false";

/** Hash-router route paths (kept in one place to avoid drift). */
export const ROUTES = {
  ROOT: "/",
  SIGNIN: "/signin",
  DASHBOARD: "/",
  CUSTOMERS: "/customers",
  CUSTOMER_DETAIL: "/customers/:id",
  FRANCHISES: "/franchises",
  USAGE: "/usage",
  USAGE_DETAIL: "/usage/:customerId",
  VTON: "/vton",
  PRICING: "/pricing",
  NOTIFICATIONS: "/notifications",
  ACTIVITY: "/activity",
  SETTINGS: "/settings",
  PROFILE: "/profile",
  DEMO: "/demo",
  DEMO_DASHBOARD: "/demo/dashboard",
} as const;

export const PAGE_SIZE = 10;

export const BUSINESS_TYPES = [
  "retail",
  "ecommerce",
  "brand",
  "marketplace",
  "agency",
  "other",
] as const;

export const VTON_CATEGORIES = [
  "tops",
  "bottoms",
  "one-pieces",
  "shoes",
  "accessories",
] as const;

export const VTON_MODES = ["quality", "balanced", "speed"] as const;

export const TIME_RANGES = [
  { label: "Today", value: "today" },
  { label: "Last 7d", value: "7d" },
  { label: "Last 30d", value: "30d" },
  { label: "All", value: "all" },
] as const;

export type TimeRangeValue = (typeof TIME_RANGES)[number]["value"];

export const DEFAULT_PRICING_TIERS = [
  { startRange: 0, endRange: 100, priceCents: 50, label: "Starter", active: true },
  { startRange: 101, endRange: 1000, priceCents: 35, label: "Growth", active: true },
  { startRange: 1001, endRange: 10000, priceCents: 20, label: "Scale", active: true },
];
