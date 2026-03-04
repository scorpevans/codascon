---
"codascon": patch
"odetovibe": patch
---

Add CJS support to codascon; trim internal types from published .d.ts files.

codascon now ships a dual CJS+ESM build — `require('codascon')` works without ERR_REQUIRE_ESM. The `.d.ts` output is also cleaned up: verbose source-doc blocks are stripped from declarations, and `getCommandStrategy` (internal dispatch method) is hidden via `@internal` + `stripInternal: true`.

odetovibe trims its package-boundary exports to the actual public API: `parseYaml`, `validateYaml`, `emitAst`, `writeFiles`, and the types needed to call them. Internal dispatch classes (`ValidateEntryCommand`, `EmitAstCommand`, `WriteFileCommand`, `SourceFileEntry`) and internal domain types are no longer exported.
