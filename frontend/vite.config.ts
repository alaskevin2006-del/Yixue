import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import { samplePdfs } from "./dev/samplePdfs";

function mockWorker(): Plugin {
  return {
    name: "yixue-mock-worker",
    configureServer(server) {
      const require = createRequire(import.meta.url);
      const worker = readFileSync(require.resolve("msw/mockServiceWorker.js"));
      server.middlewares.use("/mockServiceWorker.js", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache");
        response.end(worker);
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = env.YIXUE_API_PROXY;
  const mocks = env.VITE_ENABLE_MOCKS !== "false";
  return {
    plugins: [
      react(),
      tailwind(),
      samplePdfs(
        command === "serve" && mocks ? env.YIXUE_SAMPLE_PDF_DIR : undefined,
      ),
      ...(mocks ? [mockWorker()] : []),
    ],
    server: {
      proxy: proxy
        ? { "/api/v1": { target: proxy, changeOrigin: true } }
        : undefined,
    },
  };
});
