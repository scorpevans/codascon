import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // tsc --build already produces ESM (dist/index.js + dist/index.d.ts).
  // tsup only needs to add the CJS build (dist/index.cjs + dist/index.d.cts).
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: false, // preserve tsc output in dist/
  outDir: "dist",
});
