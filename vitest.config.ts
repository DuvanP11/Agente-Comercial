import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Esta versión de Vitest transforma con oxc (no esbuild): JSX automático para probar las pantallas.
  oxc: { jsx: { runtime: "automatic" } },
  test: { include: ["tests/**/*.test.{ts,tsx}"], hookTimeout: 60_000, testTimeout: 30_000 },
});
