import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" alias in tsconfig.json / vite.config.ts.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Business rules only — component tests would need jsdom plus a
    // Radix/framer-motion harness, which no page in this console has today.
    include: ["tests/**/*.test.ts"],
  },
});
