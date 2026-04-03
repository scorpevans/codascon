import path from "path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      codascon: path.resolve(__dirname, "dist/index.js"),
    },
  },
  test: {
    include: ["tests/**/test.*.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
    },
  },
});
