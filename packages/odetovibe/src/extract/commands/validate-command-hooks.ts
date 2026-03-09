/* @odetovibe-generated */
/*
 * @codascon/odetovibe — Extract Domain: ValidateCommandHooksCommand
 *
 * Validates `commandHooks` entries in a template or strategy config:
 *   - AbstractTemplateEntry: hook values must reference known Commands
 *   - StrategyEntry: hook keys must be a subset of the parent Template's
 *     hook keys; hook values must reference known Commands
 *
 * Used as a hook in AbstractTemplateValidator and StrategyValidator
 * (ValidateEntryCommand) to centralise commandHooks validation.
 */

import { Command } from "codascon";
import type { Template } from "codascon";
import type {
  ConfigEntry,
  ConfigIndex,
  ValidationResult,
  ValidationError,
  AbstractTemplateEntry,
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

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: AbstractTemplateHooksValidator
//
// Checks that commandHooks values reference known Commands.
// ═══════════════════════════════════════════════════════════════════

abstract class AbstractTemplateHooksValidator implements Template<
  ValidateCommandHooksCommand,
  [],
  AbstractTemplateEntry
> {
  execute(subject: AbstractTemplateEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const { key, config } = subject;
    if (!config.commandHooks) return ok();
    const errors: ValidationError[] = [];
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
    return errors.length > 0 ? fail(...errors) : ok();
  }
}

class AbstractTemplateHooksValidatorDefault extends AbstractTemplateHooksValidator {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: StrategyHooksValidator
//
// Checks that commandHooks keys are a subset of the parent Template's
// commandHooks keys, and that values reference known Commands.
// ═══════════════════════════════════════════════════════════════════

abstract class StrategyHooksValidator implements Template<
  ValidateCommandHooksCommand,
  [],
  StrategyEntry
> {
  execute(subject: StrategyEntry, object: Readonly<ConfigIndex>): ValidationResult {
    const { key, templateKey, commandKey, config } = subject;
    if (!config.commandHooks) return ok();
    const tpl = object.abstractTemplates.get(`${commandKey}.${templateKey}`);
    if (!tpl) return ok(); // parent-template error is already reported by StrategyValidator
    const parentHookKeys = new Set(Object.keys(tpl.config.commandHooks ?? {}));
    const errors: ValidationError[] = [];
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
    return errors.length > 0 ? fail(...errors) : ok();
  }
}

class StrategyHooksValidatorDefault extends StrategyHooksValidator {}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: ValidateCommandHooksCommand
// ═══════════════════════════════════════════════════════════════════

const abstractTemplateHooksValidator = new AbstractTemplateHooksValidatorDefault();
const strategyHooksValidator = new StrategyHooksValidatorDefault();

/** Validates `commandHooks` entries in an AbstractTemplateEntry or StrategyEntry. */
export class ValidateCommandHooksCommand extends Command<
  ConfigEntry,
  ConfigIndex,
  ValidationResult,
  [AbstractTemplateEntry, StrategyEntry]
> {
  readonly commandName = "validateCommandHooks" as const;

  resolveAbstractTemplate(
    subject: AbstractTemplateEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateCommandHooksCommand, [], AbstractTemplateEntry> {
    return abstractTemplateHooksValidator;
  }

  resolveStrategy(
    subject: StrategyEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateCommandHooksCommand, [], StrategyEntry> {
    return strategyHooksValidator;
  }
}
