import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";

/**
 * ThemeApplier — subscribes to the user's `settings.theme` and applies the
 * selected primary / accent / background colors, font family, and base font
 * size to the document root as CSS variables.
 *
 * Mounted once at the app root (see main.tsx) so theme changes are reflected
 * globally without re-rendering any individual screen. Returns null — renders
 * no DOM of its own.
 */
export function ThemeApplier() {
  const theme = useAuthStore((s) => s.settings.theme);
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", theme.primaryColor);
    root.style.setProperty("--accent", theme.accentColor);
    root.style.setProperty("--background", theme.backgroundColor);
    const fontMap: Record<string, string> = {
      serif: "Georgia, serif",
      "sans-serif": "Inter, sans-serif",
      monospace: "Monaco, monospace",
    };
    root.style.setProperty("--font-geist-sans", fontMap[theme.fontFamily] || fontMap["serif"]);
    const sizeMap: Record<string, string> = {
      xs: "12px",
      sm: "14px",
      base: "16px",
      lg: "18px",
      xl: "20px",
      "2xl": "24px",
    };
    root.style.fontSize = sizeMap[theme.baseFontSize] || sizeMap["base"];
  }, [theme]);
  return null;
}
