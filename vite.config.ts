import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyBundleAlias = (): Plugin => ({
  name: "legacy-bundle-alias",
  generateBundle(_options: unknown, bundle: Record<string, { type: string; isEntry?: boolean; code?: string }>) {
    const entry = Object.values(bundle).find((item) => item.type === "chunk" && item.isEntry && item.code);
    if (entry?.code) {
      this.emitFile({ type: "asset", fileName: "assets/index-DuFsNnjn.js", source: entry.code });
    }
  },
});

// https://vite.dev
export default defineConfig({
  base: './', // يحافظ على مرونة روابط المجلد العام بعد النشر
  plugins: [
    react(), 
    tailwindcss(),
    legacyBundleAlias(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});