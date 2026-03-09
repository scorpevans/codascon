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
import type { Project, SourceFile } from "ts-morph";
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
// TEMPLATE: TemplateEmitter
//
// All templates generate an abstract class with a concrete execute stub.
//
// isParameterized: true — class is generic over SU:
//   export abstract class FooTemplate<SU extends S1 | S2>
//     implements Template<FooCommand, [HookCmd], SU> {
//     readonly hookCmd = new HookCmd(); // @odetovibe-generated
//     execute(subject: SU, object: Readonly<O>): R {
//       throw new Error("Not implemented"); // @odetovibe-generated
//     }
//   }
//
// isParameterized: false — SU is fixed:
//   export abstract class FooTemplate
//     implements Template<FooCommand, [], S1 | S2> {
//     execute(subject: S1 | S2, object: Readonly<O>): R {
//       throw new Error("Not implemented"); // @odetovibe-generated
//     }
//   }
//
// Target: <namespace>/commands/<parent-cmd-name>.ts
// ═══════════════════════════════════════════════════════════════════

abstract class TemplateEmitter implements Template<EmitAstCommand, [], AbstractTemplateEntry> {
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
    const subjectSubset = config.subjectSubset ?? cmdEntry.config.subjectUnion;
    const subsetUnion = subjectSubset.join(" | ");
    const isFullUnion = !config.subjectSubset;
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
    const subjectParam = config.isParameterized ? "SU" : suRef;

    const cls = sf.addClass({ name: key, isAbstract: true, isExported: true });

    if (config.isParameterized) {
      cls.addTypeParameter({ name: "SU", constraint: suRef });
      cls.addImplements(`Template<${commandKey}, ${hooksParam}, SU>`);
    } else {
      cls.addImplements(`Template<${commandKey}, ${hooksParam}, ${suRef}>`);
    }

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
    executeMethod.addParameter({ name: "subject", type: subjectParam });
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

class TemplateEmitterDefault extends TemplateEmitter {}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: StrategyClassEmitter
//
// Emits: export class FooStrategy extends FooTemplate<S1> {
//          readonly hookCmd = new OverrideCmd(); // if hook override declared
//        }
// execute is not emitted — inherited from the Template; client fills it in there.
// Target: <namespace>/commands/<grandparent-cmd-name>.ts
// ═══════════════════════════════════════════════════════════════════

abstract class StrategyClassEmitter implements Template<EmitAstCommand, [], StrategyEntry> {
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

    const subjectSubset =
      config.subjectSubset ?? tplEntry.config.subjectSubset ?? cmdEntry.config.subjectUnion;
    const subsetUnion = subjectSubset.join(" | ");

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

    const hookOverrides = Object.entries(config.commandHooks ?? {});
    for (const [, cmdRef] of hookOverrides) {
      ensureValueImport(sf, hookImportPath(cmdRef, namespace), cmdRef);
    }

    const extendsClause = tplEntry.config.isParameterized
      ? `${templateKey}<${subsetUnion}>`
      : templateKey;

    const cls = sf.addClass({
      name: key,
      isExported: true,
      extends: extendsClause,
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

class StrategyClassEmitterDefault extends StrategyClassEmitter {}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: EmitAstCommand
// ═══════════════════════════════════════════════════════════════════

const subjectClassEmitter = new SubjectClassEmitterDefault();
const interfaceEmitter = new InterfaceEmitterDefault();
const commandClassEmitter = new CommandClassEmitterDefault();
const templateEmitter = new TemplateEmitterDefault();
const strategyClassEmitter = new StrategyClassEmitterDefault();

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
    return templateEmitter;
  }
  resolveStrategy(
    subject: StrategyEntry,
    object: Readonly<EmitContext>,
  ): Template<EmitAstCommand, [], StrategyEntry> {
    return strategyClassEmitter;
  }
}
