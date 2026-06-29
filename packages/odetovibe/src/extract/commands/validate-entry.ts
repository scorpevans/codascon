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
  MiddlewareCommandEntry,
  MiddlewareTemplateEntry,
  MiddlewareStrategyEntry,
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
//   - subjectUnion entries must reference subjectTypes (types with resolverName)
//   - dispatch must have exactly one entry per subjectUnion member
//   - dispatch values must be plain strategy names (no dot notation)
//   - dispatch values must resolve to a known strategy within this Command's templates
//   - dispatch target strategy's parent template subjectSubset must cover dispatched subject
//   - template names must be unique within a Command
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

    // subjectUnion entries must reference subjectTypes (types with resolverName) or typeImports
    for (const subjectRef of config.subjectUnion) {
      if (importedNames.has(subjectRef)) {
        console.info(
          `[odetovibe] INFO: typeImport "${subjectRef}" used as subjectUnion member of "${key}" — skipping Subject validation; compiler will enforce implementation`,
        );
      } else if (!findDomainType(object, subjectRef)) {
        errors.push(
          err(
            key,
            "subjectUnion-ref",
            `subjectUnion entry "${subjectRef}" does not reference a known domainType`,
          ),
        );
      } else if (!object.subjectTypes.has(subjectRef)) {
        errors.push(
          err(
            key,
            "subjectUnion-resolverName",
            `subjectUnion entry "${subjectRef}" is not a Subject (no resolverName)`,
          ),
        );
      }
    }

    // Resolution partition: dispatch keys ∪ defaultedSubjects must partition subjectUnion
    // (total + disjoint). A subject in neither is a forgotten subject (no silent absorption);
    // a subject in both violates disjointness.
    const dispatchKeys = new Set(Object.keys(config.dispatch));
    const unionSet = new Set(config.subjectUnion);
    const defaultedSubjects = config.defaultedSubjects ?? [];
    const defaultedSet = new Set(defaultedSubjects);

    // defaultedSubjects entries must reference subjects in subjectUnion
    for (const dr of defaultedSubjects) {
      if (!unionSet.has(dr)) {
        errors.push(
          err(
            key,
            "defaultedSubjects-ref",
            `defaultedSubjects entry "${dr}" is not in subjectUnion`,
          ),
        );
      }
    }

    for (const subjectRef of config.subjectUnion) {
      const inDispatch = dispatchKeys.has(subjectRef);
      const inDefault = defaultedSet.has(subjectRef);
      if (inDispatch && inDefault) {
        errors.push(
          err(
            key,
            "resolution-partition",
            `Subject "${subjectRef}" is in both dispatch and defaultedSubjects — the resolution partition must be disjoint`,
          ),
        );
      } else if (!inDispatch && !inDefault) {
        errors.push(
          err(
            key,
            "dispatch-coverage",
            `Subject "${subjectRef}" is in subjectUnion but in neither dispatch nor defaultedSubjects`,
          ),
        );
      }
    }
    for (const dk of dispatchKeys) {
      if (!unionSet.has(dk)) {
        errors.push(err(key, "dispatch-extra", `dispatch key "${dk}" is not in subjectUnion`));
      }
    }

    // defaultedSubjects non-empty ⟺ defaultResolver declared
    if (defaultedSubjects.length > 0 && !config.defaultResolver) {
      errors.push(
        err(
          key,
          "defaultedSubjects-resolver",
          `defaultedSubjects is non-empty but no defaultResolver strategy is declared`,
        ),
      );
    }
    if (defaultedSubjects.length === 0 && config.defaultResolver) {
      errors.push(
        err(
          key,
          "defaultResolver-moot",
          `defaultResolver is declared but defaultedSubjects is empty — list the defaulted subjects in defaultedSubjects`,
        ),
      );
    }

    // dispatch values must be plain strategy names unique across this Command's templates
    const ownTemplates = config.templates ?? {};

    // template names must be unique within this command
    // Defensive: plain JS objects enforce key uniqueness structurally; this check guards
    // against programmatic misuse and makes the semantic constraint explicit.
    const templateNames = new Set<string>();
    for (const tplName of Object.keys(ownTemplates)) {
      if (templateNames.has(tplName)) {
        errors.push(
          err(
            key,
            "templateName-unique",
            `template "${tplName}" is declared more than once in "${key}" — template names must be unique within a command`,
          ),
        );
      } else {
        templateNames.add(tplName);
      }
    }

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

    // Each dispatch value is a candidate list (normalized scalar → [scalar]).
    // Validate every candidate; the codomain of a multi-entry list must be fully valid.
    for (const [subjectRef, targets] of Object.entries(subject.dispatch)) {
      if (targets.length === 0) {
        errors.push(
          err(
            key,
            "dispatch-empty",
            `dispatch for "${subjectRef}" has no candidate strategies — name at least one`,
          ),
        );
        continue;
      }
      for (const target of targets) {
        if (!target.includes(".")) {
          // Only plain strategy names are valid dispatch targets — all templates are abstract
          const owningTplName = stratNameToTpl.get(target);
          if (owningTplName === undefined) {
            errors.push(
              err(
                key,
                "dispatch-target-ref",
                `dispatch target "${target}" for "${subjectRef}" not found — expected a strategy name`,
              ),
            );
          } else {
            const tplConfig = ownTemplates[owningTplName];
            const effectiveSubset = tplConfig.subjectSubset ?? config.subjectUnion;
            if (!effectiveSubset.includes(subjectRef)) {
              errors.push(
                err(
                  key,
                  "dispatch-subjectsubset",
                  `strategy "${target}" dispatched for "${subjectRef}" belongs to template "${owningTplName}" whose subjectSubset does not include "${subjectRef}"`,
                ),
              );
            }
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

    // Rule 10 + 11: validate Command.middleware[] list
    for (const mwRef of config.middleware ?? []) {
      const mwEntry = object.middlewareCommands.get(mwRef);
      if (!mwEntry) {
        errors.push(
          err(
            key,
            "middleware-ref",
            `middleware "${mwRef}" does not reference a known middleware command`,
          ),
        );
      } else {
        // Rule 11: middleware dispatch keys must be a superset of this command's dispatch keys
        const mwSubjects = new Set(mwEntry.config.subjectUnion);
        for (const subjectRef of config.subjectUnion) {
          if (!mwSubjects.has(subjectRef)) {
            errors.push(
              err(
                key,
                "middleware-coverage",
                `middleware "${mwRef}" does not cover subject "${subjectRef}" — its dispatch keys must be a superset of "${key}"'s`,
              ),
            );
          }
        }
      }
    }

    // Rule 12: defaultResolver must reference a known strategy and cover all subjects
    if (config.defaultResolver !== undefined) {
      const stratName = config.defaultResolver;
      const owningTplName = stratNameToTpl.get(stratName);
      if (owningTplName === undefined) {
        errors.push(
          err(
            key,
            "defaultResolver-ref",
            `defaultResolver "${stratName}" not found — expected a strategy name within "${key}"'s templates`,
          ),
        );
      } else {
        const tplConfig = ownTemplates[owningTplName];
        const effectiveTplSubset = tplConfig.subjectSubset ?? config.subjectUnion;
        const stratConfig = tplConfig.strategies[stratName];
        const effectiveStratSubset = stratConfig?.subjectSubset ?? effectiveTplSubset;
        const stratSubjectSet = new Set(effectiveStratSubset);
        for (const subjectRef of defaultedSubjects) {
          if (!stratSubjectSet.has(subjectRef)) {
            errors.push(
              err(
                key,
                "defaultResolver-coverage",
                `defaultResolver strategy "${stratName}" does not cover defaulted subject "${subjectRef}" — its effective subjectSubset must cover every subject in "${key}"'s defaultedSubjects`,
              ),
            );
          }
        }
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
      const union = new Set(cmdEntry.config.subjectUnion);
      for (const ref of config.subjectSubset) {
        if (!union.has(ref)) {
          errors.push(
            err(
              key,
              "subjectSubset",
              `subjectSubset entry "${ref}" is not in "${commandKey}"'s subjectUnion`,
            ),
          );
        }
      }
    }

    errors.push(...this.validateCommandHooks.run(subject, object).errors);

    // Abstract templates must not appear directly in dispatch — check every candidate
    for (const targets of Object.values(cmdEntry.dispatch)) {
      if (targets.includes(key)) {
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
        const parentSubset = tpl.config.subjectSubset ?? cmdEntry?.config.subjectUnion ?? [];
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
// TEMPLATE: MiddlewareCommandValidator
//
// Rules: identical to CommandValidator PLUS:
//   - template names must be unique within a MiddlewareCommand
//   - Rule 10: config.middleware[] entries must reference keys in
//     object.middlewareCommands
//   - Rule 11: each referenced middleware's effective subject union
//     must be a superset of this command's effective subject union
// ═══════════════════════════════════════════════════════════════════

abstract class MiddlewareCommandValidator implements Template<
  ValidateEntryCommand,
  [],
  MiddlewareCommandEntry
> {
  execute(subject: MiddlewareCommandEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, config } = subject;
    const importedNames = allTypeImportNames(object);

    // baseType, objectType, returnType must reference known domainTypes or typeImports
    for (const refField of ["baseType", "objectType", "returnType"] as const) {
      const ref = config[refField];
      if (importedNames.has(ref)) {
        console.info(
          `[odetovibe] INFO: typeImport "${ref}" referenced as ${refField} of middleware "${key}" — skipping domainType validation`,
        );
      } else if (!findDomainType(object, ref)) {
        errors.push(
          err(key, `${refField}-ref`, `${refField} "${ref}" does not reference a known domainType`),
        );
      }
    }

    // subject entries must reference subjectTypes or typeImports
    for (const subjectRef of config.subjectUnion) {
      if (importedNames.has(subjectRef)) {
        console.info(
          `[odetovibe] INFO: typeImport "${subjectRef}" used as subject of middleware "${key}" — skipping Subject validation; compiler will enforce implementation`,
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

    // Resolution partition (same as Command): dispatch keys ∪ defaultedSubjects partition
    // subjectUnion (total + disjoint); defaultedSubjects ⟺ defaultResolver.
    const dispatchKeys = new Set(Object.keys(config.dispatch));
    const unionSet = new Set(config.subjectUnion);
    const defaultedSubjects = config.defaultedSubjects ?? [];
    const defaultedSet = new Set(defaultedSubjects);

    for (const dr of defaultedSubjects) {
      if (!unionSet.has(dr)) {
        errors.push(
          err(
            key,
            "defaultedSubjects-ref",
            `defaultedSubjects entry "${dr}" is not in subjectUnion`,
          ),
        );
      }
    }

    for (const subjectRef of config.subjectUnion) {
      const inDispatch = dispatchKeys.has(subjectRef);
      const inDefault = defaultedSet.has(subjectRef);
      if (inDispatch && inDefault) {
        errors.push(
          err(
            key,
            "resolution-partition",
            `Subject "${subjectRef}" is in both dispatch and defaultedSubjects — the resolution partition must be disjoint`,
          ),
        );
      } else if (!inDispatch && !inDefault) {
        errors.push(
          err(
            key,
            "dispatch-coverage",
            `Subject "${subjectRef}" is in subjectUnion but in neither dispatch nor defaultedSubjects`,
          ),
        );
      }
    }
    for (const dk of dispatchKeys) {
      if (!unionSet.has(dk)) {
        errors.push(err(key, "dispatch-extra", `dispatch key "${dk}" is not in subjectUnion`));
      }
    }

    if (defaultedSubjects.length > 0 && !config.defaultResolver) {
      errors.push(
        err(
          key,
          "defaultedSubjects-resolver",
          `defaultedSubjects is non-empty but no defaultResolver strategy is declared`,
        ),
      );
    }
    if (defaultedSubjects.length === 0 && config.defaultResolver) {
      errors.push(
        err(
          key,
          "defaultResolver-moot",
          `defaultResolver is declared but defaultedSubjects is empty — list the defaulted subjects in defaultedSubjects`,
        ),
      );
    }

    // dispatch values must be plain strategy names unique across this middleware's templates
    const ownTemplates = config.templates ?? {};

    // template names must be unique within this middleware command
    // Defensive: plain JS objects enforce key uniqueness structurally; this check guards
    // against programmatic misuse and makes the semantic constraint explicit.
    const templateNames = new Set<string>();
    for (const tplName of Object.keys(ownTemplates)) {
      if (templateNames.has(tplName)) {
        errors.push(
          err(
            key,
            "templateName-unique",
            `template "${tplName}" is declared more than once in "${key}" — template names must be unique within a command`,
          ),
        );
      } else {
        templateNames.add(tplName);
      }
    }

    const stratNameToTpl = new Map<string, string>();
    for (const [tplName, tplConfig] of Object.entries(ownTemplates)) {
      for (const stratName of Object.keys(tplConfig.strategies)) {
        const existing = stratNameToTpl.get(stratName);
        if (existing !== undefined) {
          errors.push(
            err(
              key,
              "strategy-name-unique",
              `strategy name "${stratName}" is declared in both "${existing}" and "${tplName}" — strategy names must be unique across all templates within a middleware`,
            ),
          );
        } else {
          stratNameToTpl.set(stratName, tplName);
        }
      }
    }

    // Each dispatch value is a candidate list (normalized scalar → [scalar]).
    // Validate every candidate; the codomain of a multi-entry list must be fully valid.
    for (const [subjectRef, targets] of Object.entries(subject.dispatch)) {
      if (targets.length === 0) {
        errors.push(
          err(
            key,
            "dispatch-empty",
            `dispatch for "${subjectRef}" has no candidate strategies — name at least one`,
          ),
        );
        continue;
      }
      for (const target of targets) {
        if (!target.includes(".")) {
          const owningTplName = stratNameToTpl.get(target);
          if (owningTplName === undefined) {
            errors.push(
              err(
                key,
                "dispatch-target-ref",
                `dispatch target "${target}" for "${subjectRef}" not found — expected a strategy name`,
              ),
            );
          } else {
            const tplConfig = ownTemplates[owningTplName];
            const effectiveSubset = tplConfig.subjectSubset ?? config.subjectUnion;
            if (!effectiveSubset.includes(subjectRef)) {
              errors.push(
                err(
                  key,
                  "dispatch-subjectsubset",
                  `strategy "${target}" dispatched for "${subjectRef}" belongs to template "${owningTplName}" whose subjectSubset does not include "${subjectRef}"`,
                ),
              );
            }
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
    }

    // commandName-file-unique: normalized file names must be unique across all middleware commands
    const ownNorm = normalizeCommandKey(key);
    for (const [otherKey] of object.middlewareCommands) {
      if (otherKey !== key && normalizeCommandKey(otherKey) === ownNorm) {
        errors.push(
          err(
            key,
            "commandName-file-unique",
            `middleware "${key}" and "${otherKey}" both normalize to file name "${ownNorm}.ts"`,
          ),
        );
      }
    }

    // Rule 12: defaultResolver must reference a known strategy and cover all subjects
    if (config.defaultResolver !== undefined) {
      const stratName = config.defaultResolver;
      const owningTplName = stratNameToTpl.get(stratName);
      if (owningTplName === undefined) {
        errors.push(
          err(
            key,
            "defaultResolver-ref",
            `defaultResolver "${stratName}" not found — expected a strategy name within "${key}"'s templates`,
          ),
        );
      } else {
        const tplConfig = ownTemplates[owningTplName];
        const effectiveTplSubset = tplConfig.subjectSubset ?? config.subjectUnion;
        const stratConfig = tplConfig.strategies[stratName];
        const effectiveStratSubset = stratConfig?.subjectSubset ?? effectiveTplSubset;
        const stratSubjectSet = new Set(effectiveStratSubset);
        for (const subjectRef of defaultedSubjects) {
          if (!stratSubjectSet.has(subjectRef)) {
            errors.push(
              err(
                key,
                "defaultResolver-coverage",
                `defaultResolver strategy "${stratName}" does not cover defaulted subject "${subjectRef}" — its effective subjectSubset must cover every subject in "${key}"'s defaultedSubjects`,
              ),
            );
          }
        }
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

class MiddlewareCommandValidatorDefault extends MiddlewareCommandValidator {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: MiddlewareTemplateValidator
//
// Rules: identical to AbstractTemplateValidator but looks up parent
// in object.middlewareCommands instead of object.commands.
// ═══════════════════════════════════════════════════════════════════

abstract class MiddlewareTemplateValidator implements Template<
  ValidateEntryCommand,
  [ValidateCommandHooksCommand],
  MiddlewareTemplateEntry
> {
  readonly validateCommandHooks = new ValidateCommandHooksCommand();

  execute(subject: MiddlewareTemplateEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, commandKey, config } = subject;

    const cmdEntry = object.middlewareCommands.get(commandKey);
    if (!cmdEntry) {
      errors.push(
        err(
          key,
          "parent-command",
          `parent middleware command "${commandKey}" not found in ConfigIndex`,
        ),
      );
      return fail(...errors);
    }

    if (config.subjectSubset) {
      const union = new Set(cmdEntry.config.subjectUnion);
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

    // Abstract templates must not appear directly in dispatch — check every candidate
    for (const targets of Object.values(cmdEntry.dispatch)) {
      if (targets.includes(key)) {
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

class MiddlewareTemplateValidatorDefault extends MiddlewareTemplateValidator {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: MiddlewareStrategyValidator
//
// Rules: identical to StrategyValidator but looks up parent template
// in object.middlewareTemplates and parent command in
// object.middlewareCommands.
// ═══════════════════════════════════════════════════════════════════

abstract class MiddlewareStrategyValidator implements Template<
  ValidateEntryCommand,
  [ValidateCommandHooksCommand],
  MiddlewareStrategyEntry
> {
  readonly validateCommandHooks = new ValidateCommandHooksCommand();

  execute(subject: MiddlewareStrategyEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, templateKey, commandKey, config } = subject;

    const tplQualifiedKey = `${commandKey}.${templateKey}`;
    const tpl = object.middlewareTemplates.get(tplQualifiedKey);
    if (!tpl) {
      errors.push(
        err(
          key,
          "parent-template",
          `parent template "${tplQualifiedKey}" not found in middlewareTemplates`,
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
        const cmdEntry = object.middlewareCommands.get(commandKey);
        const parentSubset = tpl.config.subjectSubset ?? cmdEntry?.config.subjectUnion ?? [];
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

class MiddlewareStrategyValidatorDefault extends MiddlewareStrategyValidator {}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: ValidateEntryCommand
// ═══════════════════════════════════════════════════════════════════

const subjectTypeValidator = new SubjectTypeValidatorDefault();
const plainTypeValidator = new PlainTypeValidatorDefault();
const commandValidator = new CommandValidatorDefault();
const abstractTemplateValidator = new AbstractTemplateValidatorDefault();
const strategyValidator = new StrategyValidatorDefault();
const middlewareCommandValidator = new MiddlewareCommandValidatorDefault();
const middlewareTemplateValidator = new MiddlewareTemplateValidatorDefault();
const middlewareStrategyValidator = new MiddlewareStrategyValidatorDefault();

/** Dispatches each config entry to its schema validator via double dispatch. */
export class ValidateEntryCommand extends Command<
  ConfigEntry,
  ConfigIndex,
  ValidationResult,
  [
    SubjectTypeEntry,
    PlainTypeEntry,
    CommandEntry,
    AbstractTemplateEntry,
    StrategyEntry,
    MiddlewareCommandEntry,
    MiddlewareTemplateEntry,
    MiddlewareStrategyEntry,
  ]
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
  resolveMiddlewareCommand(
    subject: MiddlewareCommandEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], MiddlewareCommandEntry> {
    return middlewareCommandValidator;
  }
  resolveMiddlewareTemplate(
    subject: MiddlewareTemplateEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], MiddlewareTemplateEntry> {
    return middlewareTemplateValidator;
  }
  resolveMiddlewareStrategy(
    subject: MiddlewareStrategyEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], MiddlewareStrategyEntry> {
    return middlewareStrategyValidator;
  }
}
