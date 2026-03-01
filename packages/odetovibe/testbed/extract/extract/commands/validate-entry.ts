/* @odetovibe-generated */
import { Command } from "codascon";
import type { Template } from "codascon";
import type {
  ConfigEntry,
  ConfigIndex,
  ValidationResult,
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  ConcreteTemplateEntry,
  StrategyEntry,
} from "../domain-types.js";

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
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolvePlainType(
    subject: PlainTypeEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], PlainTypeEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveCommand(
    subject: CommandEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], CommandEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveAbstractTemplate(
    subject: AbstractTemplateEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], AbstractTemplateEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveConcreteTemplate(
    subject: ConcreteTemplateEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], ConcreteTemplateEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveStrategy(
    subject: StrategyEntry,
    object: Readonly<ConfigIndex>,
  ): Template<ValidateEntryCommand, [], StrategyEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class SubjectTypeValidator implements Template<ValidateEntryCommand, [], SubjectTypeEntry> {
  execute(subject: SubjectTypeEntry, object: Readonly<ConfigIndex>): ValidationResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class PlainTypeValidator implements Template<ValidateEntryCommand, [], PlainTypeEntry> {
  execute(subject: PlainTypeEntry, object: Readonly<ConfigIndex>): ValidationResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class CommandValidator implements Template<ValidateEntryCommand, [], CommandEntry> {
  execute(subject: CommandEntry, object: Readonly<ConfigIndex>): ValidationResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class AbstractTemplateValidator implements Template<
  ValidateEntryCommand,
  [],
  AbstractTemplateEntry
> {
  execute(subject: AbstractTemplateEntry, object: Readonly<ConfigIndex>): ValidationResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class ConcreteTemplateValidator implements Template<
  ValidateEntryCommand,
  [],
  ConcreteTemplateEntry
> {
  execute(subject: ConcreteTemplateEntry, object: Readonly<ConfigIndex>): ValidationResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class StrategyValidator implements Template<ValidateEntryCommand, [], StrategyEntry> {
  execute(subject: StrategyEntry, object: Readonly<ConfigIndex>): ValidationResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}
