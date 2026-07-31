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
    optimizeDeps: {
        exclude: ["@xenova/transformers", "onnxruntime-web"], // lazy-loaded only when try-on runs
    },
});
