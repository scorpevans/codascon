import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // tsc --build produces the .d.ts files; tsup/esbuild compiles CJS + ESM JS.
  // esbuild strips all comments from JS output, keeping .js/.cjs free of
  // verbose /* */ source-doc blocks that TypeScript's emitter would otherwise
  // include. The .d.ts files are still produced by tsc (dts: true below) and
  // preserve /** */ JSDoc for IDE hover, unaffected by esbuild.
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: false, // preserve tsc output in dist/
  outDir: "dist",
});
