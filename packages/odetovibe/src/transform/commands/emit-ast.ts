/* @odetovibe-generated */
/*
 * @codascon/odetovibe — Transform Domain: EmitAstCommand
 *
 * Dispatches each ConfigEntry to its emitter Template. Each emitter
 * adds TypeScript declarations to a SourceFile in the ts-morph Project.
 *
 * File placement:
 *   SubjectTypeEntry / PlainTypeEntry  →  <ns>/domain-types.ts  (or domain-types.ts if no namespace)
 *   CommandEntry                       →  <ns>/commands/<cmd-name>.ts
 *   AbstractTemplateEntry              →  same file as parent Command
 *   StrategyEntry                      →  same file as grandparent Command
 */

import { Command } from "codascon";
import type { Template } from "codascon";
import type { ClassDeclaration, Project, SourceFile } from "ts-morph";
import type {
  ConfigEntry,
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  StrategyEntry,
} from "../../extract/domain-types.js";
import type { EmitContext, EmitResult } from "../domain-types.js";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getOrCreate(project: Project, filePath: string): SourceFile {
  return project.getSourceFile(filePath) ?? project.createSourceFile(filePath, "");
}

/** Add a named import to a non-type-only import declaration, creating it if absent. */
function ensureValueImport(sf: SourceFile, moduleSpecifier: string, name: string): void {
  const decl = sf
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
  if (decl) {
    if (!decl.getNamedImports().some((n) => n.getName() === name)) {
      decl.addNamedImport(name);
    }
  } else {
    sf.addImportDeclaration({ moduleSpecifier, namedImports: [name] });
  }
}

/** Add a named import to a type-only import declaration, creating it if absent. */
function ensureTypeImport(sf: SourceFile, moduleSpecifier: string, name: string): void {
  const decl = sf
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === moduleSpecifier && d.isTypeOnly());
  if (decl) {
    if (!decl.getNamedImports().some((n) => n.getName() === name)) {
      decl.addNamedImport(name);
    }
  } else {
    sf.addImportDeclaration({
      moduleSpecifier,
      namedImports: [name],
      isTypeOnly: true,
    });
  }
}

/**
 * Converts a Command key to its output file path.
 * "AccessBuildingCommand" → "campus/commands/access-building.ts"
 */
function commandFilePath(cmdKey: string, namespace: string | undefined): string {
  const withoutSuffix = cmdKey.replace(/Command$/, "");
  const kebab = withoutSuffix.replace(/([A-Z])/g, (_, c: string, offset: number) =>
    offset === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`,
  );
  const prefix = namespace ? `${namespace}/commands/` : "commands/";
  return `${prefix}${kebab}.ts`;
}

/** Absolute virtual path for the domain-types SourceFile. */
function domainTypesFilePath(namespace: string | undefined): string {
  return namespace ? `${namespace}/domain-types.ts` : "domain-types.ts";
}

/** Relative import path from a command file to domain-types.js. */
function domainTypesRelPath(_namespace: string | undefined): string {
  // Command files live at <ns>/commands/<cmd>.ts; domain-types at <ns>/domain-types.ts.
  // Without namespace: commands/<cmd>.ts and domain-types.ts — same relative depth.
  return "../domain-types.js";
}

/**
 * Relative import path from a command file to a hook Command's file.
 * Both files live in the same commands/ directory.
 */
function hookImportPath(hookCmdKey: string, namespace: string | undefined): string {
  const fileName = commandFilePath(hookCmdKey, namespace).split("/").pop()!;
  return `./${fileName.replace(/\.ts$/, ".js")}`;
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: SubjectClassEmitter
//
// Emits: export class Foo extends Subject {
//          readonly resolverName = "resolveFoo" as const;
//        }
// Target: <ns>/domain-types.ts  (or domain-types.ts if no namespace)
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a reverse lookup from the YAML `imports` map: type name → module specifier.
 * Used by command-file emitters to import external types from their declared source
 * rather than from the local domain-types.js.
 */
function buildImportSourceMap(configIndex: EmitContext["configIndex"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [specifier, names] of Object.entries(configIndex.imports)) {
    for (const name of names) map.set(name, specifier);
  }
  return map;
}

/**
 * Adjust a namespace-relative import specifier for use from a command file,
 * which lives one directory deeper (inside `commands/`).
 * Package imports (no leading `.`) are returned unchanged.
 */
function toCommandDepth(specifier: string): string {
  return specifier.startsWith("./") || specifier.startsWith("../") ? `../${specifier}` : specifier;
}

/** Wraps a type in `Promise<T>` when `returnAsync` is true. */
function maybeAsync(typeRef: string, returnAsync: boolean | undefined): string {
  return returnAsync ? `Promise<${typeRef}>` : typeRef;
}

abstract class SubjectClassEmitter implements Template<EmitAstCommand, [], SubjectTypeEntry> {
  execute(subject: SubjectTypeEntry, object: Readonly<EmitContext>): EmitResult {
    const filePath = domainTypesFilePath(object.configIndex.namespace);
    if (object.configIndex.externalTypeKeys.has(subject.key)) return { targetFile: filePath };
    const sf = getOrCreate(object.project, filePath);
    ensureValueImport(sf, "codascon", "Subject");

    const cls = sf.addClass({
      name: subject.key,
      isExported: true,
      extends: "Subject",
    });
    cls.addProperty({
      name: "resolverName",
      isReadonly: true,
      initializer: `"${subject.config.resolverName}" as const`,
    });

    return { targetFile: filePath };
  }
}

class SubjectClassEmitterDefault extends SubjectClassEmitter {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: InterfaceEmitter
//
// Emits: export interface Foo {}   (stub — content is user-owned)
// Target: <ns>/domain-types.ts  (or domain-types.ts if no namespace)
// ═══════════════════════════════════════════════════════════════════

abstract class InterfaceEmitter implements Template<EmitAstCommand, [], PlainTypeEntry> {
  execute(subject: PlainTypeEntry, object: Readonly<EmitContext>): EmitResult {
    const filePath = domainTypesFilePath(object.configIndex.namespace);
    if (object.configIndex.externalTypeKeys.has(subject.key)) return { targetFile: filePath };
    const sf = getOrCreate(object.project, filePath);
    sf.addInterface({ name: subject.key, isExported: true });
    return { targetFile: filePath };
  }
}

class InterfaceEmitterDefault extends InterfaceEmitter {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: CommandClassEmitter
//
// Emits: export class FooCommand extends Command<B, O, R, [S1, S2]> {
//          readonly commandName = "foo" as const;
//          resolveS1(subject: S1, object: Readonly<O>): Template<FooCommand, [], S1> {
//            throw new Error("Not implemented"); // @odetovibe-generated
//          }
//          ...
//        }
// Target: <namespace>/commands/<cmd-name>.ts
// ═══════════════════════════════════════════════════════════════════

abstract class CommandClassEmitter implements Template<EmitAstCommand, [], CommandEntry> {
  execute(subject: CommandEntry, object: Readonly<EmitContext>): EmitResult {
    const { configIndex } = object;
    const { key, config } = subject;
    const namespace = configIndex.namespace;
    const filePath = commandFilePath(key, namespace);
    const sf = getOrCreate(object.project, filePath);
    const dtPath = domainTypesRelPath(namespace);
    const importSrc = buildImportSourceMap(configIndex);

    ensureValueImport(sf, "codascon", "Command");
    ensureTypeImport(sf, "codascon", "Template");

    for (const ref of [config.baseType, config.objectType, config.returnType]) {
      const src = importSrc.has(ref) ? toCommandDepth(importSrc.get(ref)!) : dtPath;
      ensureTypeImport(sf, src, ref);
    }
    for (const ref of config.subjectUnion) {
      const src = importSrc.has(ref) ? toCommandDepth(importSrc.get(ref)!) : dtPath;
      ensureTypeImport(sf, src, ref);
    }

    const returnType = maybeAsync(config.returnType, config.returnAsync);
    const subjectTuple = config.subjectUnion.join(", ");
    const cls = sf.addClass({
      name: key,
      isExported: true,
      extends: `Command<${config.baseType}, ${config.objectType}, ${returnType}, [${subjectTuple}]>`,
    });

    cls.addProperty({
      name: "commandName",
      isReadonly: true,
      initializer: `"${config.commandName}" as const`,
    });

    for (const subjectRef of config.subjectUnion) {
      const subjectEntry = configIndex.subjectTypes.get(subjectRef);
      if (!subjectEntry) continue;
      const resolverName = subjectEntry.config.resolverName;
      const method = cls.addMethod({ name: resolverName });
      method.addParameter({ name: "subject", type: subjectRef });
      method.addParameter({
        name: "object",
        type: `Readonly<${config.objectType}>`,
      });
      method.setReturnType(`Template<${key}, [], ${subjectRef}>`);
      method.addStatements([`throw new Error("Not implemented"); // @odetovibe-generated`]);
    }

    return { targetFile: filePath };
  }
}

class CommandClassEmitterDefault extends CommandClassEmitter {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: AbstractTemplateEmitter
//
// All templates generate an abstract class with a concrete execute stub.
// Two strategies handle the isParameterized split:
//
// ParameterizedTemplateEmitter (isParameterized: true) — class is generic over SU:
//   export abstract class FooTemplate<SU extends S1 | S2>
//     implements Template<FooCommand, [HookCmd], SU> {
//     readonly hookCmd = new HookCmd(); // @odetovibe-generated
//     execute(subject: SU, object: Readonly<O>): R {
//       throw new Error("Not implemented"); // @odetovibe-generated
//     }
//   }
//
// FixedTemplateEmitter (isParameterized: false) — SU is fixed:
//   export abstract class FooTemplate
//     implements Template<FooCommand, [], S1 | S2> {
//     execute(subject: S1 | S2, object: Readonly<O>): R {
//       throw new Error("Not implemented"); // @odetovibe-generated
//     }
//   }
//
// Target: <namespace>/commands/<parent-cmd-name>.ts
// ═══════════════════════════════════════════════════════════════════

abstract class AbstractTemplateEmitter implements Template<
  EmitAstCommand,
  [],
  AbstractTemplateEntry
> {
  /** Add the type parameter (if any) and implements clause to the emitted class. */
  protected abstract applyClassSignature(
    cls: ClassDeclaration,
    commandKey: string,
    hooksParam: string,
    suRef: string,
  ): void;

  /** The type to use for `subject` in the emitted execute method. */
  protected abstract subjectParamType(suRef: string): string;

  execute(subject: AbstractTemplateEntry, object: Readonly<EmitContext>): EmitResult {
    const { configIndex } = object;
    const { key, commandKey, config } = subject;
    const namespace = configIndex.namespace;
    const filePath = commandFilePath(commandKey, namespace);
    const sf = getOrCreate(object.project, filePath);
    const dtPath = domainTypesRelPath(namespace);
    const importSrc = buildImportSourceMap(configIndex);

    ensureTypeImport(sf, "codascon", "Template");

    const cmdEntry = configIndex.commands.get(commandKey)!;
    const isFullUnion = !config.subjectSubset?.length;
    const subjectSubset = isFullUnion ? cmdEntry.config.subjectUnion : config.subjectSubset!;
    const subsetUnion = subjectSubset.join(" | ");
    const suRef = isFullUnion ? `CommandSubjectUnion<${commandKey}>` : subsetUnion;

    if (isFullUnion) ensureTypeImport(sf, "codascon", "CommandSubjectUnion");

    for (const ref of subjectSubset) {
      const src = importSrc.has(ref) ? toCommandDepth(importSrc.get(ref)!) : dtPath;
      ensureTypeImport(sf, src, ref);
    }
    const retSrc = importSrc.has(cmdEntry.config.returnType)
      ? toCommandDepth(importSrc.get(cmdEntry.config.returnType)!)
      : dtPath;
    const objSrc = importSrc.has(cmdEntry.config.objectType)
      ? toCommandDepth(importSrc.get(cmdEntry.config.objectType)!)
      : dtPath;
    ensureTypeImport(sf, retSrc, cmdEntry.config.returnType);
    ensureTypeImport(sf, objSrc, cmdEntry.config.objectType);

    const hookEntries = Object.entries(config.commandHooks ?? {});
    const hookTypes = hookEntries.map(([, cmdRef]) => cmdRef);

    for (const cmdRef of hookTypes) {
      ensureValueImport(sf, hookImportPath(cmdRef, namespace), cmdRef);
    }

    const hooksParam = hookTypes.length > 0 ? `[${hookTypes.join(", ")}]` : "[]";
    const cls = sf.addClass({ name: key, isAbstract: true, isExported: false });

    this.applyClassSignature(cls, commandKey, hooksParam, suRef);

    for (const [propName, cmdRef] of hookEntries) {
      cls.addProperty({
        name: propName,
        isReadonly: true,
        initializer: `new ${cmdRef}()`, // @odetovibe-generated
      });
    }

    const executeMethod = cls.addMethod({
      name: "execute",
      isAsync: cmdEntry.config.returnAsync === true,
    });
    executeMethod.addParameter({ name: "subject", type: this.subjectParamType(suRef) });
    executeMethod.addParameter({
      name: "object",
      type: `Readonly<${cmdEntry.config.objectType}>`,
    });
    executeMethod.setReturnType(
      maybeAsync(cmdEntry.config.returnType, cmdEntry.config.returnAsync),
    );
    executeMethod.addStatements([`throw new Error("Not implemented"); // @odetovibe-generated`]);

    return { targetFile: filePath };
  }
}

class ParameterizedTemplateEmitter extends AbstractTemplateEmitter {
  protected applyClassSignature(
    cls: ClassDeclaration,
    commandKey: string,
    hooksParam: string,
    suRef: string,
  ): void {
    cls.addTypeParameter({ name: "SU", constraint: suRef });
    cls.addImplements(`Template<${commandKey}, ${hooksParam}, SU>`);
  }

  protected subjectParamType(_suRef: string): string {
    return "SU";
  }
}

class FixedTemplateEmitter extends AbstractTemplateEmitter {
  protected applyClassSignature(
    cls: ClassDeclaration,
    commandKey: string,
    hooksParam: string,
    suRef: string,
  ): void {
    cls.addImplements(`Template<${commandKey}, ${hooksParam}, ${suRef}>`);
  }

  protected subjectParamType(suRef: string): string {
    return suRef;
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: StrategyClassEmitter
//
// Emits: export class FooStrategy extends FooTemplate<S1> {
//          readonly hookCmd = new OverrideCmd(); // if hook override declared
//        }
// execute is not emitted — inherited from the Template; client fills it in there.
// Two strategies handle the parent template's isParameterized split:
//
// ParameterizedParentStrategyEmitter (parent isParameterized: true):
//   extends FooTemplate<CommandSubjectUnion<FooCommand>>   // full union
//   extends FooTemplate<S1>                                // explicit subset
//
// FixedParentStrategyEmitter (parent isParameterized: false):
//   extends FooTemplate   (no type argument)
//
// Target: <namespace>/commands/<grandparent-cmd-name>.ts
// ═══════════════════════════════════════════════════════════════════

abstract class StrategyClassEmitter implements Template<EmitAstCommand, [], StrategyEntry> {
  /** Ensure the subject type imports needed for the extends clause are present. */
  protected abstract ensureSubjectImports(
    sf: SourceFile,
    isFullUnion: boolean,
    subjectSubset: readonly string[],
    importSrc: Map<string, string>,
    dtPath: string,
  ): void;

  /** Build the extends clause for the emitted strategy class. */
  protected abstract buildExtendsClause(
    templateKey: string,
    commandKey: string,
    isFullUnion: boolean,
    subjectSubset: readonly string[],
  ): string;

  execute(subject: StrategyEntry, object: Readonly<EmitContext>): EmitResult {
    const { configIndex } = object;
    const { key, templateKey, commandKey, config } = subject;
    const namespace = configIndex.namespace;
    const filePath = commandFilePath(commandKey, namespace);
    const sf = getOrCreate(object.project, filePath);
    const dtPath = domainTypesRelPath(namespace);
    const importSrc = buildImportSourceMap(configIndex);

    const tplEntry = configIndex.abstractTemplates.get(`${commandKey}.${templateKey}`)!;
    const cmdEntry = configIndex.commands.get(commandKey)!;

    const strategyHasSubset = !!config.subjectSubset?.length;
    const templateHasSubset = !!tplEntry.config.subjectSubset?.length;
    const isFullUnion = !strategyHasSubset && !templateHasSubset;

    const subjectSubset = strategyHasSubset
      ? config.subjectSubset!
      : templateHasSubset
        ? tplEntry.config.subjectSubset!
        : cmdEntry.config.subjectUnion;

    this.ensureSubjectImports(sf, isFullUnion, subjectSubset, importSrc, dtPath);

    const retSrc = importSrc.has(cmdEntry.config.returnType)
      ? toCommandDepth(importSrc.get(cmdEntry.config.returnType)!)
      : dtPath;
    const objSrc = importSrc.has(cmdEntry.config.objectType)
      ? toCommandDepth(importSrc.get(cmdEntry.config.objectType)!)
      : dtPath;
    ensureTypeImport(sf, retSrc, cmdEntry.config.returnType);
    ensureTypeImport(sf, objSrc, cmdEntry.config.objectType);

    const hookOverrides = Object.entries(config.commandHooks ?? {});
    for (const [, cmdRef] of hookOverrides) {
      ensureValueImport(sf, hookImportPath(cmdRef, namespace), cmdRef);
    }

    const cls = sf.addClass({
      name: key,
      isExported: false,
      extends: this.buildExtendsClause(templateKey, commandKey, isFullUnion, subjectSubset),
    });

    for (const [propName, cmdRef] of hookOverrides) {
      cls.addProperty({
        name: propName,
        isReadonly: true,
        initializer: `new ${cmdRef}()`, // @odetovibe-generated
      });
    }

    return { targetFile: filePath };
  }
}

class ParameterizedParentStrategyEmitter extends StrategyClassEmitter {
  protected ensureSubjectImports(
    sf: SourceFile,
    isFullUnion: boolean,
    subjectSubset: readonly string[],
    importSrc: Map<string, string>,
    dtPath: string,
  ): void {
    if (isFullUnion) {
      ensureTypeImport(sf, "codascon", "CommandSubjectUnion");
    } else {
      for (const ref of subjectSubset) {
        const src = importSrc.has(ref) ? toCommandDepth(importSrc.get(ref)!) : dtPath;
        ensureTypeImport(sf, src, ref);
      }
    }
  }

  protected buildExtendsClause(
    templateKey: string,
    commandKey: string,
    isFullUnion: boolean,
    subjectSubset: readonly string[],
  ): string {
    const suArg = isFullUnion ? `CommandSubjectUnion<${commandKey}>` : subjectSubset.join(" | ");
    return `${templateKey}<${suArg}>`;
  }
}

class FixedParentStrategyEmitter extends StrategyClassEmitter {
  protected ensureSubjectImports(
    sf: SourceFile,
    _isFullUnion: boolean,
    subjectSubset: readonly string[],
    importSrc: Map<string, string>,
    dtPath: string,
  ): void {
    for (const ref of subjectSubset) {
      const src = importSrc.has(ref) ? toCommandDepth(importSrc.get(ref)!) : dtPath;
      ensureTypeImport(sf, src, ref);
    }
  }

  protected buildExtendsClause(
    templateKey: string,
    _commandKey: string,
    _isFullUnion: boolean,
    _subjectSubset: readonly string[],
  ): string {
    return templateKey;
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: EmitAstCommand
// ═══════════════════════════════════════════════════════════════════

const subjectClassEmitter = new SubjectClassEmitterDefault();
const interfaceEmitter = new InterfaceEmitterDefault();
const commandClassEmitter = new CommandClassEmitterDefault();
const parameterizedTemplateEmitter = new ParameterizedTemplateEmitter();
const fixedTemplateEmitter = new FixedTemplateEmitter();
const parameterizedParentStrategyEmitter = new ParameterizedParentStrategyEmitter();
const fixedParentStrategyEmitter = new FixedParentStrategyEmitter();

/** Dispatches each config entry to its TypeScript AST emitter via double dispatch. */
export class EmitAstCommand extends Command<
  ConfigEntry,
  EmitContext,
  EmitResult,
  [SubjectTypeEntry, PlainTypeEntry, CommandEntry, AbstractTemplateEntry, StrategyEntry]
> {
  readonly commandName = "emitAst" as const;

  resolveSubjectType(
    subject: SubjectTypeEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], SubjectTypeEntry> {
    return subjectClassEmitter;
  }
  resolvePlainType(
    subject: PlainTypeEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], PlainTypeEntry> {
    return interfaceEmitter;
  }
  resolveCommand(
    subject: CommandEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], CommandEntry> {
    return commandClassEmitter;
  }
  resolveAbstractTemplate(
    subject: AbstractTemplateEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], AbstractTemplateEntry> {
    return subject.config.isParameterized ? parameterizedTemplateEmitter : fixedTemplateEmitter;
  }
  resolveStrategy(
    subject: StrategyEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], StrategyEntry> {
    const tplEntry = object.configIndex.abstractTemplates.get(
      `${subject.commandKey}.${subject.templateKey}`,
    )!;
    return tplEntry.config.isParameterized
      ? parameterizedParentStrategyEmitter
      : fixedParentStrategyEmitter;
  }
}
