import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createReadStream, existsSync } from "node:fs";

const productionBase =
  process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? "/Lorsain-project/" : "/");

const qaFixtures = new Map([
  [
    "judicial",
    resolve(__dirname, "../../docs/qa/phase11_3/judicial-appointment-browser-save.json"),
  ],
  [
    "institutions",
    resolve(__dirname, "../../docs/qa/phase11_3/leadership-election-browser-save.json"),
  ],
  [
    "former-officeholder",
    resolve(__dirname, "../../docs/qa/phase11_3/former-officeholder-browser-save.json"),
  ],
  [
    "election-results",
    resolve(__dirname, "../../docs/qa/phase11_3/election-results-browser-save.json"),
  ],
  [
    "assembly-worker",
    resolve(__dirname, "../../docs/qa/phase11_3/assembly-worker-production-save.json"),
  ],
  // Phase 11.4 fixtures
  [
    "active-campaign",
    resolve(__dirname, "../../docs/qa/phase11_4/fixtures/active-campaign-browser-save.json"),
  ],
  [
    "election-night-partial",
    resolve(__dirname, "../../docs/qa/phase11_4/fixtures/election-night-partial-browser-save.json"),
  ],
]);

export default defineConfig({
  // GitHub Pages serves this repository below /Lorsain-project/. Vite rewrites
  // the entry module, imported chunks, and Worker module URLs from this base.
  // Local development remains rooted at / unless a production-subpath smoke
  // test explicitly supplies VITE_BASE_PATH.
  base: productionBase,
  plugins: [
    react(),
    {
      name: "lorsain-browser-qa-fixtures",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
          const match = /^\/__qa\/fixtures\/([a-z-]+)\.json$/.exec(pathname);
          if (!match) return next();
          const fixturePath = qaFixtures.get(match[1] ?? "");
          if (!fixturePath || !existsSync(fixturePath)) {
            response.statusCode = 404;
            response.end("Unknown browser QA fixture");
            return;
          }
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          createReadStream(fixturePath).pipe(response);
        });
      },
    },
  ],
  root: ".",
  publicDir: "public",
  server: { port: 5173, open: true },
  resolve: {
    alias: {
      "@lorsain/sim": resolve(__dirname, "../../packages/sim/src/index.ts"),
      "@lorsain/map": resolve(__dirname, "../../packages/map/src/index.ts"),
      "@lorsain/content-loader": resolve(__dirname, "../../packages/content-loader/src/index.ts"),
      "@lorsain/content-schema": resolve(__dirname, "../../packages/content-schema/src/index.ts"),
      "@lorsain/election-math": resolve(__dirname, "../../packages/election-math/src/index.ts"),
    },
  },
});
