# codascon

## 1.1.0

### Minor Changes

- a13f0ef: Add middleware support (MiddlewareCommand, per-command hooks) and defaultResolver catch-all to codascon; update odetovibe codegen to generate both features.

## 1.0.0

### Patch Changes

- 52b149b: Add CJS support to codascon; trim internal types from published .d.ts files.

  codascon now ships a dual CJS+ESM build — `require('codascon')` works without ERR_REQUIRE_ESM. The `.d.ts` output is also cleaned up: verbose source-doc blocks are stripped from declarations, and `getCommandStrategy` (internal dispatch method) is hidden via `@internal` + `stripInternal: true`.

  odetovibe trims its package-boundary exports to the actual public API: `parseYaml`, `validateYaml`, `emitAst`, `writeFiles`, and the types needed to call them. Internal dispatch classes (`ValidateEntryCommand`, `EmitAstCommand`, `WriteFileCommand`, `SourceFileEntry`) and internal domain types are no longer exported.

- ee9191f: Exclude source maps from published packages, reducing unpacked size.
- f3a01d4: README improvements: Quick Start code example clarity, aligned YAML schema example, tightened Solution section.
- f5237c8: Rename Subject.visitName to resolverName and update resolver method terminology throughout.

## 2026.3.2-beta.3

### Patch Changes

- f5237c8: Rename Subject.visitName to resolverName and update resolver method terminology throughout.

## 2026.3.2-beta.2

### Patch Changes

- f3a01d4: README improvements: Quick Start code example clarity, aligned YAML schema example, tightened Solution section.

## 2026.3.2-beta.1

### Patch Changes

- 52b149b: Add CJS support to codascon; trim internal types from published .d.ts files.

  codascon now ships a dual CJS+ESM build — `require('codascon')` works without ERR_REQUIRE_ESM. The `.d.ts` output is also cleaned up: verbose source-doc blocks are stripped from declarations, and `getCommandStrategy` (internal dispatch method) is hidden via `@internal` + `stripInternal: true`.

  odetovibe trims its package-boundary exports to the actual public API: `parseYaml`, `validateYaml`, `emitAst`, `writeFiles`, and the types needed to call them. Internal dispatch classes (`ValidateEntryCommand`, `EmitAstCommand`, `WriteFileCommand`, `SourceFileEntry`) and internal domain types are no longer exported.

## 2026.3.2-beta.0

### Patch Changes

- ee9191f: Exclude source maps from published packages, reducing unpacked size.
