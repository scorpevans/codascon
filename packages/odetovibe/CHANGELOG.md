# odetovibe

## 2026.3.2-beta.4

### Patch Changes

- f3a01d4: README improvements: Quick Start code example clarity, aligned YAML schema example, tightened Solution section.
- Updated dependencies [f3a01d4]
  - codascon@2026.3.2-beta.2

## 2026.3.2-beta.3

### Patch Changes

- 52b149b: Add CJS support to codascon; trim internal types from published .d.ts files.

  codascon now ships a dual CJS+ESM build — `require('codascon')` works without ERR_REQUIRE_ESM. The `.d.ts` output is also cleaned up: verbose source-doc blocks are stripped from declarations, and `getCommandStrategy` (internal dispatch method) is hidden via `@internal` + `stripInternal: true`.

  odetovibe trims its package-boundary exports to the actual public API: `parseYaml`, `validateYaml`, `emitAst`, `writeFiles`, and the types needed to call them. Internal dispatch classes (`ValidateEntryCommand`, `EmitAstCommand`, `WriteFileCommand`, `SourceFileEntry`) and internal domain types are no longer exported.

- Updated dependencies [52b149b]
  - codascon@2026.3.2-beta.1

## 2026.3.2-beta.2

### Patch Changes

- 769f526: Fix CLI silently doing nothing on macOS global installs due to symlink mismatch in main-module guard.

## 2026.3.2-beta.1

### Patch Changes

- 600988a: Fix Strategy classes missing execute stub; rename CLI positional arg to code_config.yaml; default --out to ./odetovibe.

## 2026.3.2-beta.0

### Patch Changes

- ee9191f: Exclude source maps from published packages, reducing unpacked size.
- Updated dependencies [ee9191f]
  - codascon@2026.3.2-beta.0

## 2026.3.1

### Patch Changes

- 82c5cab: Clarify global vs local install and npx usage in README
