// This config file is kept for reference only.
//
// In Tailwind CSS v4, the theme is declared inline in src/index.css via
// the @theme directive. This file is NOT loaded by the build (the @config
// directive was removed to fix the PostCSS "from option" warning).
//
// If you need to use a JS config in the future, re-add:
//   @config "../tailwind.config.ts";
// to src/index.css — but note that may re-trigger the PostCSS warning.

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};
