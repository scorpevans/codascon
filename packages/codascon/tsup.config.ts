import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // tsc --build produces the .d.ts files; tsup/esbuild compiles CJS + ESM JS.
  // esbuild strips all comments from JS output, keeping .js/.cjs free of
  // verbose /* */ source-doc blocks that TypeScript's emitter would otherwise
  // include. The .d.ts files are owned by tsc (dts: false): tsc correctly
  // inlines non-exported types in exported signatures, whereas tsup's
  // rollup-plugin-dts strips @internal declarations but leaves dangling name
  // references, breaking consumer type-checking. dist/index.d.cts is copied
  // from dist/index.d.ts in the build:cjs script (types are identical for
  // CJS and ESM since the module has no imports).
  format: ["cjs", "esm"],
  dts: false,
  sourcemap: true,
  clean: false, // preserve tsc-produced .d.ts files in dist/
  outDir: "dist",
});
