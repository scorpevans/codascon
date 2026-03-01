// Extract: parse and validate YAML configs
export { parseYaml, validateYaml, ValidateEntryCommand } from "./extract/index.js";
export type {
  ConfigEntry,
  ConfigIndex,
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  ConcreteTemplateEntry,
  StrategyEntry,
  ValidationError,
  ValidationResult,
  ExtractResult,
} from "./extract/index.js";

// Load: write ts-morph SourceFiles to disk
export { writeFiles, WriteFileCommand, SourceFileEntry } from "./load/index.js";
export type { WriteContext, WriteResult } from "./load/index.js";

// Transform: emit TypeScript AST from a validated ConfigIndex
export { emitAst, EmitAstCommand } from "./transform/index.js";
export type { EmitContext, EmitResult } from "./transform/index.js";

// Schema types
export type { YamlConfig, DomainType, Command, Template, Strategy } from "./schema.js";
