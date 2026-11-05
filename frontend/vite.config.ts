/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import path from "path";

// The backend writes a random API token here at startup; the dev proxy
// forwards it so the app works from the Vite dev server too.
function backendToken(): string | undefined {
  const dirs = [
    process.env.XDG_RUNTIME_DIR && join(process.env.XDG_RUNTIME_DIR, "data-vantage"),
    join(process.env.XDG_DATA_HOME || join(process.env.HOME || "", ".local/share"), "data-vantage"),
  ].filter(Boolean) as string[];
  for (const dir of dirs) {
    try {
      return readFileSync(join(dir, "token"), "utf8").trim();
    } catch {
      // try the next location
    }
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const token = backendToken();
            if (token) proxyReq.setHeader("X-Data-Vantage-Token", token);
            // The backend only accepts same-origin requests.
            proxyReq.removeHeader("origin");
          });
        },
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
