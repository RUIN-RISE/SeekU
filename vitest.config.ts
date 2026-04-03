import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environmentMatchGlobs: [
      // Use jsdom for React hooks/components tests
      ["apps/web/src/**/__tests__/*.test.ts", "jsdom"],
      ["apps/web/src/**/*.test.tsx", "jsdom"]
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/web/src"),
      "@seeku/llm": path.resolve(__dirname, "./packages/llm/src/index.ts")
    }
  }
});
