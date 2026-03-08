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
  ConcreteTemplateEntry,
  StrategyEntry,
} from "../domain-types.js";

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
//   - visitName must be prefixed with "resolve"
//   - visitName must be unique across all subjectTypes
// ═══════════════════════════════════════════════════════════════════

class SubjectTypeValidator implements Template<ValidateEntryCommand, [], SubjectTypeEntry> {
  execute(subject: SubjectTypeEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, config } = subject;

    if (!config.visitName.startsWith("resolve")) {
      errors.push(
        err(
          key,
          "visitName-prefix",
          `visitName "${config.visitName}" should be prefixed with "resolve"`,
        ),
      );
    }

    for (const [otherKey, other] of object.subjectTypes) {
      if (otherKey !== key && other.config.visitName === config.visitName) {
        errors.push(
          err(
            key,
            "visitName-unique",
            `visitName "${config.visitName}" is also declared by "${otherKey}"`,
          ),
        );
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: PlainTypeValidator
//
// Plain types have no visitName — no structural constraints to check.
// ═══════════════════════════════════════════════════════════════════

class PlainTypeValidator implements Template<ValidateEntryCommand, [], PlainTypeEntry> {
  execute(subject: PlainTypeEntry, object: Readonly<ConfigIndex>): ValidationResult {
    return ok();
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: CommandValidator
//
// Rules:
//   - baseType, objectType, returnType must reference known domainTypes
//   - subjectUnion entries must reference subjectTypes (types with visitName)
//   - dispatch must have exactly one entry per subjectUnion member
//   - dispatch values must resolve to concrete Templates or Template.Strategy
//     within this Command's own templates map
// ═══════════════════════════════════════════════════════════════════

class CommandValidator implements Template<ValidateEntryCommand, [], CommandEntry> {
  execute(subject: CommandEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const errors: ValidationError[] = [];
    const { key, config } = subject;

    // baseType, objectType, returnType must reference known domainTypes
    for (const refField of ["baseType", "objectType", "returnType"] as const) {
      const ref = config[refField];
      if (!findDomainType(object, ref)) {
        errors.push(
          err(key, `${refField}-ref`, `${refField} "${ref}" does not reference a known domainType`),
        );
      }
    }

    // subjectUnion entries must reference subjectTypes (types with visitName)
    for (const subjectRef of config.subjectUnion) {
      if (!findDomainType(object, subjectRef)) {
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
            "subjectUnion-visitName",
            `subjectUnion entry "${subjectRef}" is not a Subject (no visitName)`,
          ),
        );
      }
    }

    // dispatch coverage: exactly one entry per subjectUnion member
    const dispatchKeys = new Set(Object.keys(config.dispatch));
    const unionSet = new Set(config.subjectUnion);

    for (const subjectRef of config.subjectUnion) {
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

    // dispatch values must resolve within this Command's templates
    const ownTemplates = config.templates ?? {};

    for (const [subjectRef, target] of Object.entries(config.dispatch)) {
      const parts = target.split(".");

      if (parts.length === 1) {
        const tpl = ownTemplates[target];
        if (!tpl) {
          errors.push(
            err(
              key,
              "dispatch-target-ref",
              `dispatch target "${target}" for "${subjectRef}" not found in this Command's templates`,
            ),
          );
        } else if (Object.keys(tpl.strategies).length > 0) {
          errors.push(
            err(
              key,
              "dispatch-target-abstract",
              `dispatch target "${target}" for "${subjectRef}" has strategies — use ${target}.StrategyName`,
            ),
          );
        }
      } else if (parts.length === 2) {
        const [tplName, stratName] = parts;
        const tpl = ownTemplates[tplName];
        if (!tpl) {
          errors.push(
            err(
              key,
              "dispatch-target-ref",
              `dispatch target template "${tplName}" for "${subjectRef}" not found in this Command's templates`,
            ),
          );
        } else if (!(stratName in tpl.strategies)) {
          errors.push(
            err(
              key,
              "dispatch-target-strategy",
              `dispatch target strategy "${stratName}" not found in template "${tplName}"`,
            ),
          );
        }
      } else {
        errors.push(
          err(
            key,
            "dispatch-target-format",
            `dispatch target "${target}" for "${subjectRef}" is malformed — use "Template" or "Template.Strategy"`,
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

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: AbstractTemplateValidator
//
// Rules:
//   - subjectSubset (if present) must be subset of parent Command's subjectUnion
//   - commandHooks values must reference known Commands
//   - must not appear directly in parent Command's dispatch (abstract — use Strategy.*)
// ═══════════════════════════════════════════════════════════════════

class AbstractTemplateValidator implements Template<
  ValidateEntryCommand,
  [],
  AbstractTemplateEntry
> {
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

    if (config.commandHooks) {
      for (const [propName, cmdRef] of Object.entries(config.commandHooks)) {
        if (!object.commands.has(cmdRef)) {
          errors.push(
            err(
              key,
              "commandHook-ref",
              `commandHook "${propName}" references unknown command "${cmdRef}"`,
            ),
          );
        }
      }
    }

    // Abstract templates must not appear directly in dispatch
    for (const [, target] of Object.entries(cmdEntry.config.dispatch)) {
      if (target === key) {
        errors.push(
          err(
            key,
            "abstract-in-dispatch",
            `abstract template "${key}" is referenced directly in "${commandKey}" dispatch — use ${key}.StrategyName`,
          ),
        );
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: ConcreteTemplateValidator
//
// Rules:
//   - subjectSubset (if present) must be subset of parent Command's subjectUnion
//   - commandHooks values must reference known Commands
//   (no abstract-in-dispatch check — concrete Templates may appear directly)
// ═══════════════════════════════════════════════════════════════════

class ConcreteTemplateValidator implements Template<
  ValidateEntryCommand,
  [],
  ConcreteTemplateEntry
> {
  execute(subject: ConcreteTemplateEntry, object: Readonly<ConfigIndex>): ValidationResult {
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

    if (config.commandHooks) {
      for (const [propName, cmdRef] of Object.entries(config.commandHooks)) {
        if (!object.commands.has(cmdRef)) {
          errors.push(
            err(
              key,
              "commandHook-ref",
              `commandHook "${propName}" references unknown command "${cmdRef}"`,
            ),
          );
        }
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: StrategyValidator
//
// Rules:
//   - parent must be an AbstractTemplateEntry within the same Command
//   - subjectSubset (if present) must be subset of parent Template's effective subjectSubset
//   - subjectSubset is only meaningful when parent Template isParameterized
//   - commandHooks keys must be subset of parent Template's commandHooks keys
//   - commandHooks values must reference known Commands
// ═══════════════════════════════════════════════════════════════════

class StrategyValidator implements Template<ValidateEntryCommand, [], StrategyEntry> {
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

    if (config.commandHooks) {
      const parentHookKeys = new Set(Object.keys(tpl.config.commandHooks ?? {}));
      for (const [hookKey, cmdRef] of Object.entries(config.commandHooks)) {
        if (!parentHookKeys.has(hookKey)) {
          errors.push(
            err(
              key,
              "commandHook-key",
              `commandHook "${hookKey}" is not declared by parent template "${templateKey}"`,
            ),
          );
        }
        if (!object.commands.has(cmdRef)) {
          errors.push(
            err(
              key,
              "commandHook-ref",
              `commandHook "${hookKey}" references unknown command "${cmdRef}"`,
            ),
          );
        }
      }
    }

    return errors.length > 0 ? fail(...errors) : ok();
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: ValidateEntryCommand
// ═══════════════════════════════════════════════════════════════════

const subjectTypeValidator = new SubjectTypeValidator();
const plainTypeValidator = new PlainTypeValidator();
const commandValidator = new CommandValidator();
const abstractTemplateValidator = new AbstractTemplateValidator();
const concreteTemplateValidator = new ConcreteTemplateValidator();
const strategyValidator = new StrategyValidator();

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
    ConcreteTemplateEntry,
    StrategyEntry,
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
  resolveConcreteTemplate(
    subject: ConcreteTemplateEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], ConcreteTemplateEntry> {
    return concreteTemplateValidator;
  }
  resolveStrategy(
    subject: StrategyEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], StrategyEntry> {
    return strategyValidator;
  }
}
