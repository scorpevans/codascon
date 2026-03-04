/* @odetovibe-generated */
/*
 * @codascon/odetovibe — Extract Domain: Shared Types
 *
 * Subject types, domain interfaces, and result types used across
 * the extract domain and shared with transform and load.
 */

import { Subject } from "codascon";
import type { DomainType, Command, Template, Strategy } from "../schema.js";

// ═══════════════════════════════════════════════════════════════════
// BASE TYPE
// ═══════════════════════════════════════════════════════════════════

/** Shared interface for all config entries. */
export interface ConfigEntry {
  readonly key: string;
}

// ═══════════════════════════════════════════════════════════════════
// SUBJECTS
// ═══════════════════════════════════════════════════════════════════

/**
 * A domain type with a `visitName` — generates a Subject class.
 * Produces `class Foo extends Subject { readonly visitName = "resolveFoo" }`.
 */
export class SubjectTypeEntry extends Subject implements ConfigEntry {
  readonly visitName = "resolveSubjectType" as const;
  constructor(
    public readonly key: string,
    public readonly config: DomainType & { visitName: string },
  ) {
    super();
  }
}

/**
 * A domain type without a `visitName` — generates a plain interface.
 * Produces `interface Foo { ... }`.
 */
export class PlainTypeEntry extends Subject implements ConfigEntry {
  readonly visitName = "resolvePlainType" as const;
  constructor(
    public readonly key: string,
    public readonly config: DomainType,
  ) {
    super();
  }
}

/** A parsed `commands` entry from the YAML config. */
export class CommandEntry extends Subject implements ConfigEntry {
  readonly visitName = "resolveCommand" as const;
  constructor(
    public readonly key: string,
    public readonly config: Command,
  ) {
    super();
  }
}

/**
 * A Template with a non-empty `strategies` map — generates an abstract class.
 * Carries `commandKey` (the parent Command's key).
 */
export class AbstractTemplateEntry extends Subject implements ConfigEntry {
  readonly visitName = "resolveAbstractTemplate" as const;
  constructor(
    public readonly key: string,
    public readonly commandKey: string,
    public readonly config: Template,
  ) {
    super();
  }
}

/**
 * A Template with an empty `strategies` map — generates a concrete class.
 * Carries `commandKey` (the parent Command's key).
 */
export class ConcreteTemplateEntry extends Subject implements ConfigEntry {
  readonly visitName = "resolveConcreteTemplate" as const;
  constructor(
    public readonly key: string,
    public readonly commandKey: string,
    public readonly config: Template,
  ) {
    super();
  }
}

/**
 * A parsed Strategy entry from a Template's `strategies` map.
 * Carries both `templateKey` and `commandKey` for ancestry lookup.
 */
export class StrategyEntry extends Subject implements ConfigEntry {
  readonly visitName = "resolveStrategy" as const;
  constructor(
    public readonly key: string,
    public readonly templateKey: string,
    public readonly commandKey: string,
    public readonly config: Strategy,
  ) {
    super();
  }
}

// ═══════════════════════════════════════════════════════════════════
// OBJECT TYPE
// ═══════════════════════════════════════════════════════════════════

/*
 * The fully resolved config — maps of all parsed entries.
 * Passed as the object to `ValidateEntryCommand` so validators
 * can perform cross-reference checks.
 *
 * Template keys are qualified as `"CommandName.TemplateName"`.
 * Strategy keys are qualified as `"CommandName.TemplateName.StrategyName"`.
 */
/** Fully resolved config index — maps of all parsed config entries, ready for validation or transformation. */
export interface ConfigIndex {
  readonly namespace: string | undefined;
  /** External type-only imports for the generated domain-types.ts. From `YamlConfig.imports`. */
  readonly imports: Record<string, string[]>;
  /** Keys of types from `externalTypes` — present in ConfigIndex for validation but never emitted. */
  readonly externalTypeKeys: ReadonlySet<string>;
  readonly subjectTypes: ReadonlyMap<string, SubjectTypeEntry>;
  readonly plainTypes: ReadonlyMap<string, PlainTypeEntry>;
  readonly commands: ReadonlyMap<string, CommandEntry>;
  readonly abstractTemplates: ReadonlyMap<string, AbstractTemplateEntry>;
  readonly concreteTemplates: ReadonlyMap<string, ConcreteTemplateEntry>;
  readonly strategies: ReadonlyMap<string, StrategyEntry>;
}

// ═══════════════════════════════════════════════════════════════════
// RETURN TYPES
// ═══════════════════════════════════════════════════════════════════

/** A single validation failure. */
export interface ValidationError {
  readonly entryKey: string;
  readonly rule: string;
  readonly message: string;
}

/** Aggregated validation result for one entry. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ValidationError[];
}

/*
 * Result of the extract phase.
 *
 * `configIndex` is the parsed and indexed config — ready for the
 * transform domain. `validationResults` contains per-entry results;
 * `valid` is `true` only if every entry passed validation.
 */
/** Result of the extract phase — parsed `configIndex` plus per-entry validation results. */
export interface ExtractResult {
  readonly valid: boolean;
  readonly configIndex: ConfigIndex;
  readonly validationResults: ValidationResult[];
}
