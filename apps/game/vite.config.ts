import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  server: { port: 5173, open: true },
  resolve: {
    alias: {
      "@lorsain/sim": resolve(__dirname, "../../packages/sim/src/index.ts"),
      "@lorsain/content-loader": resolve(__dirname, "../../packages/content-loader/src/index.ts"),
    },
  },
});
