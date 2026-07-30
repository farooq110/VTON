import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
// Vite config — base "./" so the build loads correctly under Electron file://
export default defineConfig({
    plugins: [react()],
    base: "./",
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
        port: 5173,
        strictPort: true,
        host: true,
    },
    build: {
        outDir: "dist",
        sourcemap: true,
        target: "es2022",
        chunkSizeWarningLimit: 4000, // @xenova/transformers ships large WASM chunks
    },
    // Note: @xenova/transformers + onnxruntime-web are loaded from CDN at
    // runtime (see usePoseDetection.ts) — they're NOT bundled by Vite. This
    // avoids the `registerBackend` undefined error that occurs when Vite's
    // ES module bundling breaks onnxruntime-web's internal module structure.
});
