/*
 * @codascon/odetovibe — Extract Domain: Public API
 *
 * Exposes two routines:
 *   - `parseYaml(yamlPath)` — Reads a YAML config file and returns
 *     a typed `ConfigIndex` with all entries indexed.
 *   - `validateYaml(configIndex)` — Validates all entries in a
 *     `ConfigIndex` against the schema rules.
 *
 * Typical usage:
 * ```ts
 * const index = parseYaml("path/to/config.yaml");
 * const result = validateYaml(index);
 * if (!result.valid) {
 *   for (const r of result.validationResults) {
 *     for (const e of r.errors) console.error(e.message);
 *   }
 * }
 * ```
 */

import * as fs from "node:fs";
import * as yaml from "js-yaml";
import type { YamlConfig } from "../schema.js";
import {
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  ConcreteTemplateEntry,
  StrategyEntry,
} from "./domain-types.js";
import type { ConfigIndex, ExtractResult, ValidationResult } from "./domain-types.js";
import { ValidateEntryCommand } from "./commands/validate-entry.js";

// Re-export classes as values (constructible at runtime)
export {
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  ConcreteTemplateEntry,
  StrategyEntry,
} from "./domain-types.js";
// Re-export interfaces as types only
export type {
  ConfigEntry,
  ConfigIndex,
  ValidationError,
  ValidationResult,
  ExtractResult,
} from "./domain-types.js";
export { ValidateEntryCommand } from "./commands/validate-entry.js";

// ═══════════════════════════════════════════════════════════════════
// parseYaml
// ═══════════════════════════════════════════════════════════════════

/*
 * Parses a YAML config file into a typed `ConfigIndex`.
 *
 * Reads the file, parses via `js-yaml`, and builds Maps of all
 * config entries. Domain types are split at parse time:
 *   - Types with `resolverName` → `SubjectTypeEntry` (will generate a Subject class)
 *   - Types without `resolverName` → `PlainTypeEntry` (will generate an interface)
 *
 * Templates are similarly split:
 *   - Templates with non-empty `strategies` → `AbstractTemplateEntry`
 *   - Templates with empty `strategies`     → `ConcreteTemplateEntry`
 *
 * Template keys are qualified as `"CommandName.TemplateName"`.
 * Strategy keys are qualified as `"CommandName.TemplateName.StrategyName"`.
 *
 * Does not validate — call `validateYaml` on the result.
 *
 * @param yamlPath — Path to the YAML config file.
 * @returns A `ConfigIndex` ready for validation or transformation.
 */
/** Parse a YAML config file into a `ConfigIndex`. Does not validate — call `validateYaml` on the result. */
export function parseYaml(yamlPath: string): ConfigIndex {
  const raw = fs.readFileSync(yamlPath, "utf-8");
  const parsed = yaml.load(raw) as YamlConfig;

  const subjectTypes = new Map<string, SubjectTypeEntry>();
  const plainTypes = new Map<string, PlainTypeEntry>();
  const commands = new Map<string, CommandEntry>();
  const abstractTemplates = new Map<string, AbstractTemplateEntry>();
  const concreteTemplates = new Map<string, ConcreteTemplateEntry>();
  const strategies = new Map<string, StrategyEntry>();

  // ── External types (not emitted; included only for validation) ───

  const externalTypeKeys = new Set<string>();
  for (const [key, rawConfig] of Object.entries(parsed.externalTypes ?? {})) {
    const config = rawConfig ?? {};
    externalTypeKeys.add(key);
    if (config.resolverName !== undefined) {
      subjectTypes.set(
        key,
        new SubjectTypeEntry(key, config as typeof config & { resolverName: string }),
      );
    } else {
      plainTypes.set(key, new PlainTypeEntry(key, config));
    }
  }

  // ── Domain types — split on resolverName ────────────────────────────

  for (const [key, rawConfig] of Object.entries(parsed.domainTypes ?? {})) {
    const config = rawConfig ?? {};
    if (config.resolverName !== undefined) {
      subjectTypes.set(
        key,
        new SubjectTypeEntry(key, config as typeof config & { resolverName: string }),
      );
    } else {
      plainTypes.set(key, new PlainTypeEntry(key, config));
    }
  }

  // ── Commands (with nested templates and strategies) ───────────────

  for (const [cmdKey, cmdConfig] of Object.entries(parsed.commands ?? {})) {
    commands.set(cmdKey, new CommandEntry(cmdKey, cmdConfig));

    for (const [tplKey, tplConfig] of Object.entries(cmdConfig.templates ?? {})) {
      const qualifiedTplKey = `${cmdKey}.${tplKey}`;

      if (Object.keys(tplConfig.strategies).length > 0) {
        abstractTemplates.set(
          qualifiedTplKey,
          new AbstractTemplateEntry(tplKey, cmdKey, tplConfig),
        );
      } else {
        concreteTemplates.set(
          qualifiedTplKey,
          new ConcreteTemplateEntry(tplKey, cmdKey, tplConfig),
        );
      }

      for (const [stratKey, stratConfig] of Object.entries(tplConfig.strategies)) {
        const qualifiedStratKey = `${cmdKey}.${tplKey}.${stratKey}`;
        strategies.set(qualifiedStratKey, new StrategyEntry(stratKey, tplKey, cmdKey, stratConfig));
      }
    }
  }

  return {
    namespace: parsed.namespace,
    imports: parsed.imports ?? {},
    externalTypeKeys,
    subjectTypes,
    plainTypes,
    commands,
    abstractTemplates,
    concreteTemplates,
    strategies,
  };
}

// ═══════════════════════════════════════════════════════════════════
// validateYaml
// ═══════════════════════════════════════════════════════════════════

/*
 * Validates all entries in a `ConfigIndex` against the schema rules.
 *
 * Uses the codascon protocol — `ValidateEntryCommand` dispatches
 * each entry to the appropriate validator Template based on its
 * `Subject` type.
 *
 * @param configIndex — The parsed config index from `parseYaml`.
 * @returns An `ExtractResult` with per-entry validation results.
 */
/** Validate all entries in a `ConfigIndex` against the schema rules. Returns per-entry results. */
export function validateYaml(configIndex: ConfigIndex): ExtractResult {
  const validateCmd = new ValidateEntryCommand();
  const results: ValidationResult[] = [];

  for (const entry of configIndex.subjectTypes.values()) {
    results.push(validateCmd.run(entry, configIndex));
  }
  for (const entry of configIndex.plainTypes.values()) {
    results.push(validateCmd.run(entry, configIndex));
  }
  for (const entry of configIndex.commands.values()) {
    results.push(validateCmd.run(entry, configIndex));
  }
  for (const entry of configIndex.abstractTemplates.values()) {
    results.push(validateCmd.run(entry, configIndex));
  }
  for (const entry of configIndex.concreteTemplates.values()) {
    results.push(validateCmd.run(entry, configIndex));
  }
  for (const entry of configIndex.strategies.values()) {
    results.push(validateCmd.run(entry, configIndex));
  }

  const valid = results.every((r) => r.valid);
  return { valid, configIndex, validationResults: results };
}
