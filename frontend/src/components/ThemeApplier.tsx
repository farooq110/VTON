import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";

/**
 * ThemeApplier — subscribes to the user's `settings.theme` and applies the
 * selected primary / accent / background colors, font family, and base font
 * size to the document root as CSS variables.
 *
 * Issue 3 fix — Tailwind v4 uses `--color-primary`, `--color-accent`,
 * `--color-background` (with the `--color-` prefix) in its `@theme` block.
 * We set ALL the color variables that Tailwind uses, including derived ones
 * like `--color-primary-foreground`, `--color-secondary-foreground`,
 * `--color-ring`, so the entire UI updates when the theme changes.
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

    // Primary color + derived foreground (white text on any primary color).
    root.style.setProperty("--color-primary", theme.primaryColor);
    root.style.setProperty("--color-primary-foreground", "#ffffff");
    root.style.setProperty("--color-secondary-foreground", theme.primaryColor);
    root.style.setProperty("--color-ring", theme.primaryColor);

    // Accent color + derived foreground (dark text on accent).
    root.style.setProperty("--color-accent", theme.accentColor);
    root.style.setProperty("--color-accent-foreground", "#1a1a1a");

    // Background color.
    root.style.setProperty("--color-background", theme.backgroundColor);

    // Also set non-prefixed variants for any custom CSS.
    root.style.setProperty("--primary", theme.primaryColor);
    root.style.setProperty("--accent", theme.accentColor);
    root.style.setProperty("--background", theme.backgroundColor);

    // Font family.
    const fontMap: Record<string, string> = {
      serif: "Georgia, serif",
      "sans-serif": "Inter, sans-serif",
      monospace: "Monaco, monospace",
    };
    root.style.setProperty("--font-geist-sans", fontMap[theme.fontFamily] || fontMap["serif"]);

    // Base font size.
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
