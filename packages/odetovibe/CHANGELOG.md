# odetovibe

## 1.1.0

### Minor Changes

- a13f0ef: Add middleware support (MiddlewareCommand, per-command hooks) and defaultResolver catch-all to codascon; update odetovibe codegen to generate both features.

### Patch Changes

- Updated dependencies [a13f0ef]
  - codascon@1.1.0

## 1.0.0

### Patch Changes

- 769f526: Fix CLI silently doing nothing on macOS global installs due to symlink mismatch in main-module guard.
- 52b149b: Add CJS support to codascon; trim internal types from published .d.ts files.

  codascon now ships a dual CJS+ESM build — `require('codascon')` works without ERR_REQUIRE_ESM. The `.d.ts` output is also cleaned up: verbose source-doc blocks are stripped from declarations, and `getCommandStrategy` (internal dispatch method) is hidden via `@internal` + `stripInternal: true`.

  odetovibe trims its package-boundary exports to the actual public API: `parseYaml`, `validateYaml`, `emitAst`, `writeFiles`, and the types needed to call them. Internal dispatch classes (`ValidateEntryCommand`, `EmitAstCommand`, `WriteFileCommand`, `SourceFileEntry`) and internal domain types are no longer exported.

- ee9191f: Exclude source maps from published packages, reducing unpacked size.
- f3a01d4: README improvements: Quick Start code example clarity, aligned YAML schema example, tightened Solution section.
- f5237c8: Rename Subject.visitName to resolverName and update resolver method terminology throughout.
- 600988a: Fix Strategy classes missing execute stub; rename CLI positional arg to code_config.yaml; default --out to ./odetovibe.
- c2e16c3: Rename `imports` to `typeImports` in the YAML schema and remove `externalTypes`; all domain participants now declared under `domainTypes`.
- 0a73233: Support typeImports as subjectUnion members — validator accepts imported types without re-generating them; emitter skips resolver stubs for typeImport subjects and logs INFO.
- Updated dependencies [52b149b]
- Updated dependencies [ee9191f]
- Updated dependencies [f3a01d4]
- Updated dependencies [f5237c8]
  - codascon@1.0.0

## 2026.3.2-beta.7

### Patch Changes

- 0a73233: Support typeImports as subjectUnion members — validator accepts imported types without re-generating them; emitter skips resolver stubs for typeImport subjects and logs INFO.

## 2026.3.2-beta.6

### Patch Changes

- c2e16c3: Rename `imports` to `typeImports` in the YAML schema and remove `externalTypes`; all domain participants now declared under `domainTypes`.

## 2026.3.2-beta.5

### Patch Changes

- f5237c8: Rename Subject.visitName to resolverName and update resolver method terminology throughout.
- Updated dependencies [f5237c8]
  - codascon@2026.3.2-beta.3

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
