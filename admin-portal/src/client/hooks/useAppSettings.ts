import { useCallback, useEffect, useState } from "react";

export type FontFamily = "system" | "inter" | "geist" | "mono";
export type FontSize = "sm" | "md" | "lg";

export interface AppSettings {
  theme: "light" | "dark" | "system";
  fontFamily: FontFamily;
  fontSize: FontSize;
  pricingTierMin: number;
  pricingTierMax: number;
  currencySymbol: string;
  currencyCode: string;
  orgName: string;
  supportEmail: string;
  defaultKeyExpiryDays: number;
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
}

const STORAGE_KEY = "admin-portal:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  fontFamily: "system",
  fontSize: "md",
  pricingTierMin: 1,
  pricingTierMax: 5,
  currencySymbol: "$",
  currencyCode: "USD",
  orgName: "Acme VTON",
  supportEmail: "support@example.com",
  defaultKeyExpiryDays: 365,
  notifications: {
    email: true,
    push: true,
    inApp: true,
  },
};

function load(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyFontFamily(settings.fontFamily);
    applyFontSize(settings.fontSize);
  }, [settings]);

  const update = useCallback(
    (patch: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
      setSettings((prev) =>
        typeof patch === "function" ? patch(prev) : { ...prev, ...patch },
      );
    },
    [],
  );

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, reset };
}

function applyFontFamily(family: FontFamily) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const map: Record<FontFamily, string> = {
    system: "system-ui, sans-serif",
    inter: "'Inter', system-ui, sans-serif",
    geist: "'Geist', system-ui, sans-serif",
    mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  };
  root.style.setProperty("--app-font-family", map[family]);
}

function applyFontSize(size: FontSize) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const map: Record<FontSize, string> = { sm: "14px", md: "16px", lg: "18px" };
  root.style.setProperty("--app-font-size", map[size]);
}
