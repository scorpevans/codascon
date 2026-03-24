/* @odetovibe-generated */
/*
 * @codascon/odetovibe — Extract Domain: ValidateEntryCommand
 *
 * Dispatches each config entry to the appropriate validator Template.
 * Each validator checks schema rules specific to its Subject type.
 */

import { Command } from "codascon";
import type { Template } from "codascon";
import type {
  ConfigEntry,
  ConfigIndex,
  ValidationResult,
  ValidationError,
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  StrategyEntry,
} from "../domain-types.js";
import { ValidateCommandHooksCommand } from "./validate-command-hooks.js";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(...errors: ValidationError[]): ValidationResult {
  return { valid: false, errors };
}

function err(entryKey: string, rule: string, message: string): ValidationError {
  return { entryKey, rule, message };
}

/** Look up a domain type by name across both subjectTypes and plainTypes. */
function findDomainType(index: ConfigIndex, ref: string) {
  return index.subjectTypes.get(ref) ?? index.plainTypes.get(ref);
}

/** Returns a flat Set of all type names declared in the typeImports map. */
function allTypeImportNames(index: ConfigIndex): Set<string> {
  const result = new Set<string>();
  for (const names of Object.values(index.typeImports)) {
    for (const name of names) result.add(name);
  }
  return result;
}

/**
 * Returns the effective subject list for a Command config.
 * When `subjectUnion` is present (deprecated), returns it for backward compat.
 * When absent, derives the list from the `dispatch` map's keys.
 */
function effectiveSubjectUnion(config: import("../../schema.js").Command): string[] {
  return config.subjectUnion ?? Object.keys(config.dispatch);
}

/**
 * Normalize a command key to the base file name it produces:
 * strip a trailing "Command" suffix, then convert PascalCase to kebab-case.
 * "AccessBuildingCommand" → "access-building"
 * "AccessBuilding"        → "access-building"  (collision with above)
 * "FeedCommand"           → "feed"
 */
function normalizeCommandKey(key: string): string {
  const s = key.replace(/Command$/, "");
  return s.replace(/([A-Z])/g, (_, c: string, offset: number) =>
    offset === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`,
  );
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: SubjectTypeValidator
//
// Rules:
//   - resolverName must be prefixed with "resolve"
//   - resolverName must be unique across all subjectTypes
// ═══════════════════════════════════════════════════════════════════

abstract class SubjectTypeValidator implements Template<
  ValidateEntryCommand,
  [],
  SubjectTypeEntry
> {
  execute(subject: SubjectTypeEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, config } = subject;

    if (!config.resolverName.startsWith("resolve")) {
      errors.push(
        err(
          key,
          "resolverName-prefix",
          `resolverName "${config.resolverName}" should be prefixed with "resolve"`,
        ),
      );
    }

    for (const [otherKey, other] of object.subjectTypes) {
      if (otherKey !== key && other.config.resolverName === config.resolverName) {
        errors.push(
          err(
            key,
            "resolverName-unique",
            `resolverName "${config.resolverName}" is also declared by "${otherKey}"`,
          ),
        );
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

class SubjectTypeValidatorDefault extends SubjectTypeValidator {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: PlainTypeValidator
//
// Plain types have no resolverName — no structural constraints to check.
// ═══════════════════════════════════════════════════════════════════

abstract class PlainTypeValidator implements Template<ValidateEntryCommand, [], PlainTypeEntry> {
  execute(subject: PlainTypeEntry, object: Readonly<ConfigIndex>): ValidationResult {
    return ok();
  }
}

class PlainTypeValidatorDefault extends PlainTypeValidator {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: CommandValidator
//
// Rules:
//   - baseType, objectType, returnType must reference known domainTypes
//   - effective subject list (dispatch keys, or subjectUnion when present)
//     must reference subjectTypes (types with resolverName)
//   - when subjectUnion is present: cross-validated against dispatch keys
//   - dispatch values must be plain strategy names (no dot notation)
//   - dispatch values must resolve to a known strategy within this Command's templates
//   - strategy names must be unique across all templates within a Command
// ═══════════════════════════════════════════════════════════════════

abstract class CommandValidator implements Template<ValidateEntryCommand, [], CommandEntry> {
  execute(subject: CommandEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, config } = subject;
    const importedNames = allTypeImportNames(object);

    // baseType, objectType, returnType must reference known domainTypes or typeImports
    for (const refField of ["baseType", "objectType", "returnType"] as const) {
      const ref = config[refField];
      if (importedNames.has(ref)) {
        console.info(
          `[odetovibe] INFO: typeImport "${ref}" referenced as ${refField} of "${key}" — skipping domainType validation`,
        );
      } else if (!findDomainType(object, ref)) {
        errors.push(
          err(key, `${refField}-ref`, `${refField} "${ref}" does not reference a known domainType`),
        );
      }
    }

    // effective subject list: dispatch keys (authoritative), or subjectUnion when present (deprecated)
    const subjects = effectiveSubjectUnion(config);

    // subject entries must reference subjectTypes (types with resolverName) or typeImports
    for (const subjectRef of subjects) {
      if (importedNames.has(subjectRef)) {
        console.info(
          `[odetovibe] INFO: typeImport "${subjectRef}" used as subject of "${key}" — skipping Subject validation; compiler will enforce implementation`,
        );
      } else if (!findDomainType(object, subjectRef)) {
        errors.push(
          err(
            key,
            "subjectUnion-ref",
            `subject "${subjectRef}" does not reference a known domainType`,
          ),
        );
      } else if (!object.subjectTypes.has(subjectRef)) {
        errors.push(
          err(
            key,
            "subjectUnion-resolverName",
            `subject "${subjectRef}" is not a Subject (no resolverName)`,
          ),
        );
      }
    }

    // cross-validation: when subjectUnion is present, it must match dispatch keys exactly
    const dispatchKeys = new Set(Object.keys(config.dispatch));
    const unionSet = new Set(subjects);

    for (const subjectRef of subjects) {
      if (!dispatchKeys.has(subjectRef)) {
        errors.push(
          err(
            key,
            "dispatch-coverage",
            `Subject "${subjectRef}" is in subjectUnion but missing from dispatch`,
          ),
        );
      }
    }
    for (const dk of dispatchKeys) {
      if (!unionSet.has(dk)) {
        errors.push(err(key, "dispatch-extra", `dispatch key "${dk}" is not in subjectUnion`));
      }
    }

    // dispatch values must be plain strategy names unique across this Command's templates
    const ownTemplates = config.templates ?? {};

    // strategy names must be unique across all templates within this command
    const stratNameToTpl = new Map<string, string>(); // stratName → first template that declared it
    for (const [tplName, tplConfig] of Object.entries(ownTemplates)) {
      for (const stratName of Object.keys(tplConfig.strategies)) {
        const existing = stratNameToTpl.get(stratName);
        if (existing !== undefined) {
          errors.push(
            err(
              key,
              "strategy-name-unique",
              `strategy name "${stratName}" is declared in both "${existing}" and "${tplName}" — strategy names must be unique across all templates within a command`,
            ),
          );
        } else {
          stratNameToTpl.set(stratName, tplName);
        }
      }
    }

    for (const [subjectRef, target] of Object.entries(config.dispatch)) {
      if (!target.includes(".")) {
        // Only plain strategy names are valid dispatch targets — all templates are abstract
        const isStrategy = Object.values(ownTemplates).some((t) => target in t.strategies);
        if (!isStrategy) {
          errors.push(
            err(
              key,
              "dispatch-target-ref",
              `dispatch target "${target}" for "${subjectRef}" not found — expected a strategy name`,
            ),
          );
        }
      } else {
        errors.push(
          err(
            key,
            "dispatch-target-format",
            `dispatch target "${target}" for "${subjectRef}" is malformed — use a plain strategy name`,
          ),
        );
      }
    }

    // commandName-file-unique: normalized file names must be unique across all commands
    const ownNorm = normalizeCommandKey(key);
    for (const [otherKey] of object.commands) {
      if (otherKey !== key && normalizeCommandKey(otherKey) === ownNorm) {
        errors.push(
          err(
            key,
            "commandName-file-unique",
            `command "${key}" and "${otherKey}" both normalize to file name "${ownNorm}.ts"`,
          ),
        );
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

class CommandValidatorDefault extends CommandValidator {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: AbstractTemplateValidator
//
// Rules:
//   - subjectSubset (if present) must be subset of parent Command's subjectUnion
//   - commandHooks delegated to ValidateCommandHooksCommand hook
//   - must not appear directly in parent Command's dispatch (abstract — use Strategy.*)
// ═══════════════════════════════════════════════════════════════════

abstract class AbstractTemplateValidator implements Template<
  ValidateEntryCommand,
  [ValidateCommandHooksCommand],
  AbstractTemplateEntry
> {
  readonly validateCommandHooks = new ValidateCommandHooksCommand();

  execute(subject: AbstractTemplateEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, commandKey, config } = subject;

    const cmdEntry = object.commands.get(commandKey);
    if (!cmdEntry) {
      errors.push(
        err(key, "parent-command", `parent command "${commandKey}" not found in ConfigIndex`),
      );
      return fail(...errors);
    }

    if (config.subjectSubset) {
      const union = new Set(effectiveSubjectUnion(cmdEntry.config));
      for (const ref of config.subjectSubset) {
        if (!union.has(ref)) {
          errors.push(
            err(
              key,
              "subjectSubset",
              `subjectSubset entry "${ref}" is not in "${commandKey}"'s subject union`,
            ),
          );
        }
      }
    }

    errors.push(...this.validateCommandHooks.run(subject, object).errors);

    // Abstract templates must not appear directly in dispatch
    for (const [, target] of Object.entries(cmdEntry.config.dispatch)) {
      if (target === key) {
        errors.push(
          err(
            key,
            "abstract-in-dispatch",
            `abstract template "${key}" is referenced directly in "${commandKey}" dispatch — use a plain strategy name instead`,
          ),
        );
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

class AbstractTemplateValidatorDefault extends AbstractTemplateValidator {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: StrategyValidator
//
// Rules:
//   - parent must be an AbstractTemplateEntry within the same Command
//   - subjectSubset (if present) must be subset of parent Template's effective subjectSubset
//   - subjectSubset is only meaningful when parent Template isParameterized
//   - commandHooks delegated to ValidateCommandHooksCommand hook
// ═══════════════════════════════════════════════════════════════════

abstract class StrategyValidator implements Template<
  ValidateEntryCommand,
  [ValidateCommandHooksCommand],
  StrategyEntry
> {
  readonly validateCommandHooks = new ValidateCommandHooksCommand();

  execute(subject: StrategyEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, templateKey, commandKey, config } = subject;

    // Strategies only exist under abstract templates (non-empty strategies map)
    const tplQualifiedKey = `${commandKey}.${templateKey}`;
    const tpl = object.abstractTemplates.get(tplQualifiedKey);
    if (!tpl) {
      errors.push(
        err(
          key,
          "parent-template",
          `parent template "${tplQualifiedKey}" not found in abstractTemplates`,
        ),
      );
      return fail(...errors);
    }

    if (config.subjectSubset) {
      if (!tpl.config.isParameterized) {
        errors.push(
          err(
            key,
            "subjectSubset-moot",
            `subjectSubset is declared but parent template "${templateKey}" is not parameterized`,
          ),
        );
      } else {
        const cmdEntry = object.commands.get(commandKey);
        const parentSubset =
          tpl.config.subjectSubset ?? (cmdEntry ? effectiveSubjectUnion(cmdEntry.config) : []);
        const parentSet = new Set(parentSubset);
        for (const ref of config.subjectSubset) {
          if (!parentSet.has(ref)) {
            errors.push(
              err(
                key,
                "subjectSubset-parent",
                `subjectSubset entry "${ref}" is not in parent template "${templateKey}"'s subjectSubset`,
              ),
            );
          }
        }
      }
    }

    errors.push(...this.validateCommandHooks.run(subject, object).errors);

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

class StrategyValidatorDefault extends StrategyValidator {}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: ValidateEntryCommand
// ═══════════════════════════════════════════════════════════════════

const subjectTypeValidator = new SubjectTypeValidatorDefault();
const plainTypeValidator = new PlainTypeValidatorDefault();
const commandValidator = new CommandValidatorDefault();
const abstractTemplateValidator = new AbstractTemplateValidatorDefault();
const strategyValidator = new StrategyValidatorDefault();

/** Dispatches each config entry to its schema validator via double dispatch. */
export class ValidateEntryCommand extends Command<
  ConfigEntry,
  ConfigIndex,
  ValidationResult,
  [SubjectTypeEntry, PlainTypeEntry, CommandEntry, AbstractTemplateEntry, StrategyEntry]
> {
  readonly commandName = "validateEntry" as const;

  resolveSubjectType(
    subject: SubjectTypeEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], SubjectTypeEntry> {
    return subjectTypeValidator;
  }
  resolvePlainType(
    subject: PlainTypeEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], PlainTypeEntry> {
    return plainTypeValidator;
  }
  resolveCommand(
    subject: CommandEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], CommandEntry> {
    return commandValidator;
  }
  resolveAbstractTemplate(
    subject: AbstractTemplateEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], AbstractTemplateEntry> {
    return abstractTemplateValidator;
  }
  resolveStrategy(
    subject: StrategyEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], StrategyEntry> {
    return strategyValidator;
  }
}
