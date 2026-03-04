import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  // tsc --build produces the .d.ts files; tsup/esbuild compiles the ESM JS.
  // esbuild strips all comments from JS output, keeping .js files free of
  // verbose /* */ source-doc blocks that TypeScript's emitter would otherwise
  // include. The .d.ts files are still produced by tsc (dts: false) and
  // preserve /** */ JSDoc for IDE hover, unaffected by esbuild.
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: false, // preserve tsc-produced .d.ts files in dist/
  outDir: "dist",
});
