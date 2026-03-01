/* @odetovibe-generated */
import { Command } from "codascon";
import type { Template } from "codascon";
import type {
  ConfigEntry,
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  ConcreteTemplateEntry,
  StrategyEntry,
} from "../../extract/domain-types.js";
import type { EmitContext, EmitResult } from "../domain-types.js";

export class EmitAstCommand extends Command<
  ConfigEntry,
  EmitContext,
  EmitResult,
  [
    SubjectTypeEntry,
    PlainTypeEntry,
    CommandEntry,
    AbstractTemplateEntry,
    ConcreteTemplateEntry,
    StrategyEntry,
  ]
> {
  readonly commandName = "emitAst" as const;

  resolveSubjectType(
    subject: SubjectTypeEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], SubjectTypeEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolvePlainType(
    subject: PlainTypeEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], PlainTypeEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveCommand(
    subject: CommandEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], CommandEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveAbstractTemplate(
    subject: AbstractTemplateEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], AbstractTemplateEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveConcreteTemplate(
    subject: ConcreteTemplateEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], ConcreteTemplateEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  resolveStrategy(
    subject: StrategyEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], StrategyEntry> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class SubjectClassEmitter implements Template<EmitAstCommand, [], SubjectTypeEntry> {
  execute(subject: SubjectTypeEntry, object: Readonly<EmitContext>): EmitResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class InterfaceEmitter implements Template<EmitAstCommand, [], PlainTypeEntry> {
  execute(subject: PlainTypeEntry, object: Readonly<EmitContext>): EmitResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class CommandClassEmitter implements Template<EmitAstCommand, [], CommandEntry> {
  execute(subject: CommandEntry, object: Readonly<EmitContext>): EmitResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class AbstractTemplateEmitter implements Template<
  EmitAstCommand,
  [],
  AbstractTemplateEntry
> {
  execute(subject: AbstractTemplateEntry, object: Readonly<EmitContext>): EmitResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class ConcreteTemplateEmitter implements Template<
  EmitAstCommand,
  [],
  ConcreteTemplateEntry
> {
  execute(subject: ConcreteTemplateEntry, object: Readonly<EmitContext>): EmitResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class StrategyClassEmitter implements Template<EmitAstCommand, [], StrategyEntry> {
  execute(subject: StrategyEntry, object: Readonly<EmitContext>): EmitResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}
