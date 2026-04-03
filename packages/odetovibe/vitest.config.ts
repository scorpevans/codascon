import path from "path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      [path.resolve(__dirname, "src")]: path.resolve(__dirname, "dist"),
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
