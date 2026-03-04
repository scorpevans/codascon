// Extract: parse and validate YAML configs
export { parseYaml, validateYaml } from "./extract/index.js";
export type {
  ConfigIndex,
  ValidationError,
  ValidationResult,
  ExtractResult,
} from "./extract/index.js";

// Load: write ts-morph SourceFiles to disk
export { writeFiles } from "./load/index.js";
export type { WriteContext, WriteResult } from "./load/index.js";

// Transform: emit TypeScript AST from a validated ConfigIndex
export { emitAst } from "./transform/index.js";
export type { EmitContext, EmitResult } from "./transform/index.js";

// Schema types
export type { YamlConfig, DomainType, Command, Template, Strategy } from "./schema.js";
