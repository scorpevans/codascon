/**
 * @codascon/odetovibe — Transform Domain Tests
 *
 * Covers:
 *   - SubjectClassEmitter: minimal stub — extends Subject + resolverName only
 *   - InterfaceEmitter: empty stub — name only, content is user-owned
 *   - CommandClassEmitter: class generics, commandName, resolver methods, file path, imports
 *   - AbstractTemplateEmitter: abstract class, type parameter / fixed SU, implements, hooks, execute
 *   - StrategyClassEmitter: extends clause, hook overrides, execute stub (sync + async), file path
 *   - emitAst: orchestration, file accumulation, namespace routing
 */

import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import {
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  StrategyEntry,
  MiddlewareCommandEntry,
  MiddlewareTemplateEntry,
  MiddlewareStrategyEntry,
} from "../../src/extract/domain-types.js";
import type { ConfigIndex } from "../../src/extract/domain-types.js";
import { emitAst, EmitAstCommand } from "../../src/transform/index.js";
import type { EmitContext } from "../../src/transform/index.js";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function makeProject(): Project {
  return new Project({ useInMemoryFileSystem: true });
}

function idx(overrides: Partial<ConfigIndex> = {}): ConfigIndex {
  return {
    namespace: undefined,
    typeImports: {},
    subjectTypes: new Map(),
    plainTypes: new Map(),
    commands: new Map(),
    abstractTemplates: new Map(),
    strategies: new Map(),
    middlewareCommands: new Map(),
    middlewareTemplates: new Map(),
    middlewareStrategies: new Map(),
    ...overrides,
  };
}

function ctx(configIndex: ConfigIndex, project = makeProject()): EmitContext {
  return { configIndex, project };
}

/** Full text of a source file already created in the project. */
function text(project: Project, filePath: string): string {
  return project.getSourceFileOrThrow(filePath).getFullText();
}

const emitCmd = new EmitAstCommand();

// ─── Shared domain entries ───────────────────────────────────────────────────

const student = new SubjectTypeEntry("Student", { resolverName: "resolveStudent" });
const professor = new SubjectTypeEntry("Professor", { resolverName: "resolveProfessor" });
const person = new PlainTypeEntry("Person", {});
const building = new PlainTypeEntry("Building", {});
const accessResult = new PlainTypeEntry("AccessResult", {});

const withTypes = idx({
  subjectTypes: new Map([
    ["Student", student],
    ["Professor", professor],
  ]),
  plainTypes: new Map([
    ["Person", person],
    ["Building", building],
    ["AccessResult", accessResult],
  ]),
});

/** Minimal command with Student + Professor in subjectUnion. */
const cmdEntry = new CommandEntry("AccessBuildingCommand", {
  commandName: "accessBuilding",
  baseType: "Person",
  objectType: "Building",
  returnType: "AccessResult",
  subjectUnion: ["Student", "Professor"],
  dispatch: {
    Student: "AccessTemplate.DepartmentMatch",
    Professor: "GrantAccess",
  },
  templates: {
    AccessTemplate: {
      isParameterized: true,
      subjectSubset: ["Student"],
      strategies: { DepartmentMatch: {} },
    },
    GrantAccess: { isParameterized: false, strategies: {} },
  },
});

const withCmd: ConfigIndex = {
  ...withTypes,
  commands: new Map([["AccessBuildingCommand", cmdEntry]]),
};

// ═══════════════════════════════════════════════════════════════════
// SubjectClassEmitter
// ═══════════════════════════════════════════════════════════════════

describe("SubjectClassEmitter", () => {
  it("returns targetFile 'domain-types.ts'", () => {
    const project = makeProject();
    const result = emitCmd.run(student, ctx(idx(), project));
    expect(result.targetFile).toBe("domain-types.ts");
  });

  it("creates domain-types.ts in the project", () => {
    const project = makeProject();
    emitCmd.run(student, ctx(idx(), project));
    expect(project.getSourceFile("domain-types.ts")).toBeDefined();
  });

  it("emits an exported class extending Subject", () => {
    const project = makeProject();
    emitCmd.run(student, ctx(idx(), project));
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const cls = sf.getClassOrThrow("Student");
    expect(cls.isExported()).toBe(true);
    expect(cls.getExtends()?.getText()).toContain("Subject");
  });

  it("emits readonly resolverName property with the correct literal", () => {
    const project = makeProject();
    emitCmd.run(student, ctx(idx(), project));
    const t = text(project, "domain-types.ts");
    expect(t).toContain('readonly resolverName = "resolveStudent" as const');
  });

  it("emits no constructor (field content is user-owned)", () => {
    const project = makeProject();
    emitCmd.run(student, ctx(idx(), project));
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    expect(sf.getClassOrThrow("Student").getConstructors()).toHaveLength(0);
  });

  it("adds a value import for Subject from codascon", () => {
    const project = makeProject();
    emitCmd.run(student, ctx(idx(), project));
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const imp = sf.getImportDeclarations().find((d) => d.getModuleSpecifierValue() === "codascon");
    expect(imp).toBeDefined();
    expect(imp!.isTypeOnly()).toBe(false);
    expect(imp!.getNamedImports().map((n) => n.getName())).toContain("Subject");
  });

  it("accumulates multiple subject classes in the same file", () => {
    const project = makeProject();
    const c = ctx(idx(), project);
    emitCmd.run(student, c);
    emitCmd.run(professor, c);
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    expect(sf.getClass("Student")).toBeDefined();
    expect(sf.getClass("Professor")).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// InterfaceEmitter
// ═══════════════════════════════════════════════════════════════════

describe("InterfaceEmitter", () => {
  it("returns targetFile 'domain-types.ts'", () => {
    const project = makeProject();
    const result = emitCmd.run(building, ctx(idx(), project));
    expect(result.targetFile).toBe("domain-types.ts");
  });

  it("emits an exported interface with the correct name", () => {
    const project = makeProject();
    emitCmd.run(building, ctx(idx(), project));
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const iface = sf.getInterfaceOrThrow("Building");
    expect(iface.isExported()).toBe(true);
  });

  it("emits an empty stub (content is user-owned — no properties emitted)", () => {
    const project = makeProject();
    emitCmd.run(building, ctx(idx(), project));
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    expect(sf.getInterfaceOrThrow("Building").getProperties()).toHaveLength(0);
  });

  it("does not add codascon imports (plain types need no framework import)", () => {
    const project = makeProject();
    emitCmd.run(building, ctx(idx(), project));
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    expect(sf.getImportDeclarations()).toHaveLength(0);
  });

  it("accumulates subject classes and interfaces in the same file", () => {
    const project = makeProject();
    const c = ctx(idx(), project);
    emitCmd.run(student, c);
    emitCmd.run(building, c);
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    expect(sf.getClass("Student")).toBeDefined();
    expect(sf.getInterface("Building")).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// CommandClassEmitter
// ═══════════════════════════════════════════════════════════════════

describe("CommandClassEmitter", () => {
  it("returns targetFile 'commands/access-building.ts' when namespace is undefined", () => {
    const project = makeProject();
    const result = emitCmd.run(cmdEntry, ctx(withTypes, project));
    expect(result.targetFile).toBe("commands/access-building.ts");
  });

  it("returns namespaced path when namespace is set", () => {
    const project = makeProject();
    const result = emitCmd.run(cmdEntry, ctx({ ...withTypes, namespace: "campus" }, project));
    expect(result.targetFile).toBe("campus/commands/access-building.ts");
  });

  it("strips 'Command' suffix from key for the file name", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    expect(project.getSourceFile("commands/access-building.ts")).toBeDefined();
    expect(project.getSourceFile("commands/access-building-command.ts")).toBeUndefined();
  });

  it("emits an exported class extending Command with the correct generics", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessBuildingCommand");
    expect(cls.isExported()).toBe(true);
    expect(cls.getExtends()?.getText()).toBe(
      "Command<Person, Building, AccessResult, [Student, Professor]>",
    );
  });

  it("emits readonly commandName with the correct literal", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain('readonly commandName = "accessBuilding" as const');
  });

  it("emits one resolver method per subject with correct signature", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessBuildingCommand");
    const methods = cls.getMethods();
    const methodNames = methods.map((m) => m.getName());
    expect(methodNames).toContain("resolveStudent");
    expect(methodNames).toContain("resolveProfessor");
  });

  it("resolver methods have the correct return type and @odetovibe-generated stub", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("Template<AccessBuildingCommand, [], Student>");
    expect(t).toContain("Template<AccessBuildingCommand, [], Professor>");
    expect(t).toContain("@odetovibe-generated");
  });

  it("emits a private readonly singleton for a strategy dispatch target", () => {
    // Use a configIndex with abstractTemplates populated so the filter applies.
    // Student → "AccessTemplate.DepartmentMatch" — terminal "DepartmentMatch" is NOT in abstractTemplates → singleton
    // Professor → "GrantAccess" — "AccessBuildingCommand.GrantAccess" IS in abstractTemplates → no singleton
    const withTemplates = idx({
      ...withCmd,
      abstractTemplates: new Map([
        [
          "AccessBuildingCommand.GrantAccess",
          new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
            isParameterized: false,
            strategies: {},
          }),
        ],
      ]),
    });
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTemplates, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessBuildingCommand");
    const dept = cls.getPropertyOrThrow("departmentMatch");
    expect(dept.isReadonly()).toBe(true);
    expect(dept.getInitializer()?.getText()).toBe("new DepartmentMatch()");
    expect(cls.getProperty("grantAccess")).toBeUndefined(); // abstract template → no singleton
  });

  it("resolver stub returns singleton for strategy target; throws for abstract template target", () => {
    const withTemplates = idx({
      ...withCmd,
      abstractTemplates: new Map([
        [
          "AccessBuildingCommand.GrantAccess",
          new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
            isParameterized: false,
            strategies: {},
          }),
        ],
      ]),
    });
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTemplates, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessBuildingCommand");
    expect(cls.getMethodOrThrow("resolveStudent").getBodyText()).toContain(
      "return this.departmentMatch",
    );
    expect(cls.getMethodOrThrow("resolveProfessor").getBodyText()).toContain("throw new Error");
  });

  it("deduplicates singleton fields when multiple subjects share the same dispatch target", () => {
    const sharedDispatchCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "SharedStrategy", Professor: "SharedStrategy" },
    });
    const project = makeProject();
    emitCmd.run(sharedDispatchCmd, ctx(withTypes, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessBuildingCommand");
    // Only one singleton field, not two
    const singletonProps = cls.getProperties().filter((p) => p.getName() === "sharedStrategy");
    expect(singletonProps).toHaveLength(1);
    expect(cls.getMethodOrThrow("resolveStudent").getBodyText()).toContain(
      "return this.sharedStrategy",
    );
    expect(cls.getMethodOrThrow("resolveProfessor").getBodyText()).toContain(
      "return this.sharedStrategy",
    );
  });

  it("emits defaultResolver property initialised to the named strategy singleton", () => {
    const drCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "DepartmentMatch", Professor: "DepartmentMatch" },
      defaultResolver: "CatchAll",
      templates: {
        AccessTemplate: {
          isParameterized: false,
          strategies: { DepartmentMatch: {}, CatchAll: {} },
        },
      },
    });
    const project = makeProject();
    emitCmd.run(drCmd, ctx(withTypes, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessBuildingCommand");
    const prop = cls.getPropertyOrThrow("defaultResolver");
    expect(prop.isReadonly()).toBe(true);
    expect(prop.getTypeNode()?.getText()).toBe("CatchAll");
    expect(prop.getInitializer()?.getText()).toContain("this.catchAll");
  });

  it("deduplicates singleton when defaultResolver names a strategy already used in dispatch", () => {
    const drCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "SharedStrategy", Professor: "SharedStrategy" },
      defaultResolver: "SharedStrategy",
      templates: {
        AccessTemplate: {
          isParameterized: false,
          strategies: { SharedStrategy: {} },
        },
      },
    });
    const project = makeProject();
    emitCmd.run(drCmd, ctx(withTypes, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessBuildingCommand");
    // Only one singleton field despite dispatch + defaultResolver both naming SharedStrategy
    const singletonProps = cls.getProperties().filter((p) => p.getName() === "sharedStrategy");
    expect(singletonProps).toHaveLength(1);
    const drProp = cls.getPropertyOrThrow("defaultResolver");
    expect(drProp.isReadonly()).toBe(true);
    expect(drProp.getInitializer()?.getText()).toContain("this.sharedStrategy");
  });

  it("skips resolver stub for subjects absent from dispatch when defaultResolver is declared", () => {
    // Professor is in subjectUnion but NOT in dispatch — defaultResolver handles it.
    // The emitter must not generate a resolveProfessor stub; only resolveStudent is emitted.
    const drCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "DepartmentMatch" }, // Professor intentionally absent
      defaultResolver: "CatchAll",
      templates: {
        AccessTemplate: {
          isParameterized: false,
          strategies: { DepartmentMatch: {}, CatchAll: {} },
        },
      },
    });
    const project = makeProject();
    emitCmd.run(drCmd, ctx(withTypes, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessBuildingCommand");
    // Student has a dispatch entry — its resolver stub must be emitted
    expect(cls.getMethod("resolveStudent")).toBeDefined();
    // Professor has no dispatch entry — its resolver stub must NOT be emitted
    expect(cls.getMethod("resolveProfessor")).toBeUndefined();
    // defaultResolver property must still be emitted and be readonly
    expect(cls.getProperty("defaultResolver")?.isReadonly()).toBe(true);
  });

  it("imports Command as value and Template as type from codascon", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const decls = sf.getImportDeclarations();
    const valueImp = decls.find(
      (d) => d.getModuleSpecifierValue() === "codascon" && !d.isTypeOnly(),
    );
    const typeImp = decls.find((d) => d.getModuleSpecifierValue() === "codascon" && d.isTypeOnly());
    expect(valueImp?.getNamedImports().map((n) => n.getName())).toContain("Command");
    expect(typeImp?.getNamedImports().map((n) => n.getName())).toContain("Template");
  });

  it("type-imports all referenced domain types from domain-types.js", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const dtImp = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue().includes("domain-types") && d.isTypeOnly());
    const importedNames = dtImp?.getNamedImports().map((n) => n.getName()) ?? [];
    expect(importedNames).toContain("Person");
    expect(importedNames).toContain("Building");
    expect(importedNames).toContain("AccessResult");
    expect(importedNames).toContain("Student");
    expect(importedNames).toContain("Professor");
  });

  it("wraps returnType in Promise<T> in Command generic when returnAsync is true", () => {
    const asyncCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      returnAsync: true,
    });
    const project = makeProject();
    emitCmd.run(asyncCmd, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessBuildingCommand");
    expect(cls.getExtends()?.getText()).toBe(
      "Command<Person, Building, Promise<AccessResult>, [Student, Professor]>",
    );
  });

  it("produces correct file name for a single-word key with 'Command' suffix (FeedCommand → feed.ts)", () => {
    const feedCmd = new CommandEntry("FeedCommand", {
      commandName: "feed",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "GrantAccess" },
      templates: { GrantAccess: { isParameterized: false, strategies: {} } },
    });
    const project = makeProject();
    emitCmd.run(feedCmd, ctx(withTypes, project));
    expect(project.getSourceFile("commands/feed.ts")).toBeDefined();
    expect(project.getSourceFile("commands/feed-command.ts")).toBeUndefined();
  });

  it("produces correct file name when key has no 'Command' suffix", () => {
    const accessCmd = new CommandEntry("AccessBuilding", {
      commandName: "accessBuilding",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "GrantAccess" },
      templates: { GrantAccess: { isParameterized: false, strategies: {} } },
    });
    const project = makeProject();
    emitCmd.run(accessCmd, ctx(withTypes, project));
    expect(project.getSourceFile("commands/access-building.ts")).toBeDefined();
  });

  it("imports a type from its declared import source when present in configIndex.typeImports", () => {
    // When configIndex.typeImports maps a type name to a package specifier,
    // buildImportSourceMap routes that type's import to the declared source
    // instead of domain-types.js (covers the buildImportSourceMap loop body).
    const index = idx({
      typeImports: { "person-module": ["Person"] },
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", professor],
      ]),
      plainTypes: new Map([
        ["Building", building],
        ["AccessResult", accessResult],
      ]),
      commands: new Map([["AccessBuildingCommand", cmdEntry]]),
    });
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    // Person is imported from "person-module", not from domain-types.js
    const personImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue() === "person-module");
    expect(personImp?.getNamedImports().map((n) => n.getName())).toContain("Person");
    // Person must NOT appear in the domain-types.js import
    const dtImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue().includes("domain-types"));
    expect(dtImp?.getNamedImports().map((n) => n.getName()) ?? []).not.toContain("Person");
  });

  it("imports bare returnType (not Promise<T>) from domain-types when returnAsync is true", () => {
    const asyncCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      returnAsync: true,
    });
    const project = makeProject();
    emitCmd.run(asyncCmd, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const dtImp = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue().includes("domain-types") && d.isTypeOnly());
    const importedNames = dtImp?.getNamedImports().map((n) => n.getName()) ?? [];
    expect(importedNames).toContain("AccessResult");
    expect(importedNames).not.toContain("Promise<AccessResult>");
  });

  it("adds to an existing value import declaration when the name is not yet present", () => {
    // ensureValueImport line 45: decl exists but target name is absent → addNamedImport fires
    const project = makeProject();
    project.createSourceFile(
      "commands/access-building.ts",
      `import { SomeExisting } from "codascon";\n`,
    );
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const valueImports = sf
      .getImportDeclarations()
      .filter((d) => d.getModuleSpecifierValue() === "codascon" && !d.isTypeOnly());
    // Must not create a duplicate — still one value import declaration
    expect(valueImports).toHaveLength(1);
    const names = valueImports[0].getNamedImports().map((n) => n.getName());
    expect(names).toContain("Command"); // newly added
    expect(names).toContain("SomeExisting"); // pre-existing preserved
  });

  it("prefixes a relative import specifier with '../' for command-file depth", () => {
    // toCommandDepth: specifier starts with "./" → "../" prepended so import is correct
    // from inside commands/ (one level deeper than the namespace root).
    const index = idx({
      typeImports: { "./shared.js": ["Person"] },
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", professor],
      ]),
      plainTypes: new Map([
        ["Building", building],
        ["AccessResult", accessResult],
      ]),
      commands: new Map([["AccessBuildingCommand", cmdEntry]]),
    });
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    // toCommandDepth("./shared.js") === ".././shared.js"
    const personImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue() === ".././shared.js");
    expect(personImp).toBeDefined();
    expect(personImp!.getNamedImports().map((n) => n.getName())).toContain("Person");
  });

  it("imports a subject type from declared source when its key is in configIndex.typeImports", () => {
    // The subjectUnion loop checks importSrc: when a subject key is declared in
    // typeImports, its import is routed to the declared source instead of domain-types.js.
    const index = idx({
      typeImports: { "ext-pkg": ["Student"] },
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", professor],
      ]),
      plainTypes: new Map([
        ["Building", building],
        ["AccessResult", accessResult],
      ]),
      commands: new Map([["AccessBuildingCommand", cmdEntry]]),
    });
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const extImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue() === "ext-pkg");
    expect(extImp).toBeDefined();
    expect(extImp!.getNamedImports().map((n) => n.getName())).toContain("Student");
  });

  it("skips resolver-method generation for a subjectUnion member absent from subjectTypes (line 230 continue)", () => {
    // configIndex.subjectTypes.get("Ghost") = undefined → !subjectEntry = true → continue at line 230.
    // No resolver method is emitted for "Ghost"; the method for the known subject is still emitted.
    const ghostCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      subjectUnion: ["Student", "Ghost"],
    });
    const index = idx({
      subjectTypes: new Map([["Student", student]]), // "Ghost" absent
      plainTypes: new Map([
        ["Building", building],
        ["AccessResult", accessResult],
      ]),
      commands: new Map([["AccessBuildingCommand", ghostCmd]]),
    });
    const project = makeProject();
    emitCmd.run(ghostCmd, ctx(index, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessBuildingCommand");
    const methodNames = cls.getMethods().map((m) => m.getName());
    expect(methodNames).toContain("resolveStudent"); // known subject → resolver method emitted
    expect(methodNames).not.toContain("resolveGhost"); // "Ghost" absent → skipped
  });
});

// ═══════════════════════════════════════════════════════════════════
// AbstractTemplateEmitter — AbstractTemplateEntry path
// ═══════════════════════════════════════════════════════════════════

describe("AbstractTemplateEmitter — AbstractTemplateEntry", () => {
  const tplEntry = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
    isParameterized: true,
    subjectSubset: ["Student"],
    strategies: { DepartmentMatch: {} },
  });

  it("writes to the same file as its parent Command", () => {
    const project = makeProject();
    const result = emitCmd.run(tplEntry, ctx(withCmd, project));
    expect(result.targetFile).toBe("commands/access-building.ts");
  });

  it("emits a non-exported abstract class", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessTemplate");
    expect(cls.isExported()).toBe(false);
    expect(cls.isAbstract()).toBe(true);
  });

  it("adds a SU type parameter constrained to subjectSubset when isParameterized", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessTemplate");
    const typeParams = cls.getTypeParameters();
    expect(typeParams).toHaveLength(1);
    expect(typeParams[0].getName()).toBe("SU");
    expect(typeParams[0].getConstraint()?.getText()).toBe("Student");
  });

  it("constrains SU to a union type when subjectSubset has multiple members", () => {
    const multiSubsetTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student", "Professor"],
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(multiSubsetTpl, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const typeParams = sf.getClassOrThrow("AccessTemplate").getTypeParameters();
    expect(typeParams[0].getConstraint()?.getText()).toBe("Student | Professor");
  });

  it("constrains SU to CommandSubjectUnion when subjectSubset is absent", () => {
    const noSubsetTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(noSubsetTpl, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const typeParams = sf.getClassOrThrow("AccessTemplate").getTypeParameters();
    expect(typeParams[0].getConstraint()?.getText()).toBe(
      "CommandSubjectUnion<AccessBuildingCommand>",
    );
  });

  it("constrains SU to CommandSubjectUnion when subjectSubset is empty array", () => {
    const emptySubsetTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: [],
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(emptySubsetTpl, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const typeParams = sf.getClassOrThrow("AccessTemplate").getTypeParameters();
    expect(typeParams[0].getConstraint()?.getText()).toBe(
      "CommandSubjectUnion<AccessBuildingCommand>",
    );
  });

  it("has no type parameter when not isParameterized", () => {
    const nonParam = new AbstractTemplateEntry("FlatTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(nonParam, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("FlatTemplate");
    expect(cls.getTypeParameters()).toHaveLength(0);
  });

  it("implements Template<Command, [], SU> in the parameterized case", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("Template<AccessBuildingCommand, [], SU>");
  });

  it("implements Template<Command, [], CommandSubjectUnion<Command>> in the non-parameterized case", () => {
    const nonParam = new AbstractTemplateEntry("FlatTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(nonParam, ctx(withCmd, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain(
      "Template<AccessBuildingCommand, [], CommandSubjectUnion<AccessBuildingCommand>>",
    );
  });

  it("emits a concrete execute stub with correct params, return type, and @odetovibe-generated comment", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessTemplate");
    const execute = cls.getMethodOrThrow("execute");
    expect(execute.isAbstract()).toBe(false);
    expect(execute.getReturnTypeNode()?.getText()).toBe("AccessResult");
    expect(execute.getBodyText()).toContain("throw new Error");
    expect(execute.getBodyText()).toContain("@odetovibe-generated");
    const params = execute.getParameters();
    expect(params[0].getName()).toBe("subject");
    expect(params[1].getName()).toBe("object");
    expect(params[1].getTypeNode()?.getText()).toBe("Readonly<Building>");
  });

  it("execute is async and returns Promise<T> when returnAsync is true", () => {
    const asyncCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      returnAsync: true,
    });
    const project = makeProject();
    emitCmd.run(
      tplEntry,
      ctx({ ...withCmd, commands: new Map([["AccessBuildingCommand", asyncCmd]]) }, project),
    );
    const execute = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("AccessTemplate")
      .getMethodOrThrow("execute");
    expect(execute.isAsync()).toBe(true);
    expect(execute.getReturnTypeNode()?.getText()).toBe("Promise<AccessResult>");
  });

  it("emits hook properties and imports hook Command class when commandHooks declared", () => {
    // Set up a hook command that lives in a separate file
    const auditCmd = new CommandEntry("AuditCommand", {
      commandName: "audit",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "GrantAccess" },
      templates: { GrantAccess: { isParameterized: false, strategies: {} } },
    });
    const tplWithHook = new AbstractTemplateEntry("HookedTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      commandHooks: { audit: "AuditCommand" },
      strategies: { StratA: {} },
    });
    const index: ConfigIndex = {
      ...withCmd,
      commands: new Map([
        ["AccessBuildingCommand", cmdEntry],
        ["AuditCommand", auditCmd],
      ]),
    };
    const project = makeProject();
    emitCmd.run(tplWithHook, ctx(index, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("readonly audit = new AuditCommand()");
    expect(t).toContain(
      "Template<AccessBuildingCommand, [AuditCommand], CommandSubjectUnion<AccessBuildingCommand>>",
    );
    // AuditCommand must be imported as a value
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const hookImp = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue().includes("audit") && !d.isTypeOnly());
    expect(hookImp?.getNamedImports().map((n) => n.getName())).toContain("AuditCommand");
  });

  it("adds a second name to an existing hook value-import when two hooks resolve to the same file path (line 45)", () => {
    // hookImportPath("FooCommand") = "./foo.js"  (strips "Command" → "Foo" → kebab "foo")
    // hookImportPath("Foo")        = "./foo.js"  (no "Command" suffix → "Foo" → kebab "foo")
    // 1st ensureValueImport(sf, "./foo.js", "FooCommand") → creates import { FooCommand } (else branch)
    // 2nd ensureValueImport(sf, "./foo.js", "Foo")        → decl exists, "Foo" absent → line 45 fires
    const tplWithTwoHooks = new AbstractTemplateEntry("HookedTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      commandHooks: { hookA: "FooCommand", hookB: "Foo" },
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(tplWithTwoHooks, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const fooImport = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === "./foo.js" && !d.isTypeOnly());
    expect(fooImport).toBeDefined();
    const names = fooImport!.getNamedImports().map((n) => n.getName());
    expect(names).toContain("FooCommand");
    expect(names).toContain("Foo");
  });

  it("imports subject, returnType and objectType from declared sources in configIndex.typeImports", () => {
    // buildImportSourceMap maps "Student", "AccessResult", "Building" → "external-pkg"
    // via typeImports; each is routed to the declared source instead of domain-types.js.
    const index = idx({
      typeImports: { "external-pkg": ["Student", "AccessResult", "Building"] },
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", professor],
      ]),
      plainTypes: new Map([
        ["Building", building],
        ["AccessResult", accessResult],
      ]),
      commands: new Map([["AccessBuildingCommand", cmdEntry]]),
    });
    const tpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      subjectSubset: ["Student"],
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(tpl, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const extImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue() === "external-pkg");
    expect(extImp).toBeDefined();
    const importedNames = extImp!.getNamedImports().map((n) => n.getName());
    expect(importedNames).toContain("Student");
    expect(importedNames).toContain("AccessResult");
    expect(importedNames).toContain("Building");
  });
});

// ═══════════════════════════════════════════════════════════════════
// AbstractTemplateEmitter — isParameterized: false path
// ═══════════════════════════════════════════════════════════════════

describe("AbstractTemplateEmitter — isParameterized: false", () => {
  const tplEntry = new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
    isParameterized: false,
    strategies: {},
  });

  it("writes to the same file as its parent Command", () => {
    const project = makeProject();
    const result = emitCmd.run(tplEntry, ctx(withCmd, project));
    expect(result.targetFile).toBe("commands/access-building.ts");
  });

  it("emits a non-exported abstract class", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("GrantAccess");
    expect(cls.isExported()).toBe(false);
    expect(cls.isAbstract()).toBe(true);
  });

  it("implements Template<Command, [], CommandSubjectUnion<Command>> (full union when no subjectSubset)", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain(
      "Template<AccessBuildingCommand, [], CommandSubjectUnion<AccessBuildingCommand>>",
    );
  });

  it("implements Template<Command, [], CommandSubjectUnion<Command>> when subjectSubset is empty array", () => {
    const emptySubsetTpl = new AbstractTemplateEntry("FlatTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      subjectSubset: [],
      strategies: {},
    });
    const project = makeProject();
    emitCmd.run(emptySubsetTpl, ctx(withCmd, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain(
      "Template<AccessBuildingCommand, [], CommandSubjectUnion<AccessBuildingCommand>>",
    );
  });

  it("implements Template with narrowed subjectSubset when subjectSubset is declared", () => {
    const narrowed = new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
      isParameterized: false,
      subjectSubset: ["Student"],
      strategies: {},
    });
    const project = makeProject();
    emitCmd.run(narrowed, ctx(withCmd, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("Template<AccessBuildingCommand, [], Student>");
  });

  it("emits execute with a throw stub and @odetovibe-generated comment", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const execute = sf.getClassOrThrow("GrantAccess").getMethodOrThrow("execute");
    expect(execute.isAbstract()).toBe(false);
    expect(execute.getBodyText()).toContain("@odetovibe-generated");
    expect(execute.getBodyText()).toContain("throw new Error");
  });

  it("emits hook properties when commandHooks is declared", () => {
    const auditCmd = new CommandEntry("AuditCommand", {
      commandName: "audit",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "GrantAccess" },
      templates: { GrantAccess: { isParameterized: false, strategies: {} } },
    });
    const tplWithHook = new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
      isParameterized: false,
      commandHooks: { audit: "AuditCommand" },
      strategies: {},
    });
    const index: ConfigIndex = {
      ...withCmd,
      commands: new Map([
        ["AccessBuildingCommand", cmdEntry],
        ["AuditCommand", auditCmd],
      ]),
    };
    const project = makeProject();
    emitCmd.run(tplWithHook, ctx(index, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("readonly audit = new AuditCommand()");
    expect(t).toContain("Template<AccessBuildingCommand, [AuditCommand],");
  });

  it("execute is not async when returnAsync is absent", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const execute = sf.getClassOrThrow("GrantAccess").getMethodOrThrow("execute");
    expect(execute.isAsync()).toBe(false);
  });

  it("execute is async and returns Promise<T> when returnAsync is true", () => {
    const asyncCmd = new CommandEntry("AccessBuildingCommand", {
      ...cmdEntry.config,
      returnAsync: true,
    });
    const asyncWithCmd: ConfigIndex = {
      ...withCmd,
      commands: new Map([["AccessBuildingCommand", asyncCmd]]),
    };
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(asyncWithCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const execute = sf.getClassOrThrow("GrantAccess").getMethodOrThrow("execute");
    expect(execute.isAsync()).toBe(true);
    expect(execute.getReturnType().getText()).toContain("Promise");
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("Promise<AccessResult>");
  });

  it("imports subject, returnType and objectType from declared sources in configIndex.typeImports", () => {
    const index = idx({
      typeImports: { "external-pkg": ["Student", "AccessResult", "Building"] },
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", professor],
      ]),
      plainTypes: new Map([
        ["Building", building],
        ["AccessResult", accessResult],
      ]),
      commands: new Map([["AccessBuildingCommand", cmdEntry]]),
    });
    const tpl = new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
      isParameterized: false,
      subjectSubset: ["Student"],
      strategies: {},
    });
    const project = makeProject();
    emitCmd.run(tpl, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const extImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue() === "external-pkg");
    expect(extImp).toBeDefined();
    const importedNames = extImp!.getNamedImports().map((n) => n.getName());
    expect(importedNames).toContain("Student");
    expect(importedNames).toContain("AccessResult");
    expect(importedNames).toContain("Building");
  });
});

// ═══════════════════════════════════════════════════════════════════
// StrategyClassEmitter
// ═══════════════════════════════════════════════════════════════════

describe("StrategyClassEmitter", () => {
  const abstractTplEntry = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
    isParameterized: true,
    subjectSubset: ["Student"],
    strategies: { DepartmentMatch: {} },
  });

  const stratEntry = new StrategyEntry(
    "DepartmentMatch",
    "AccessTemplate",
    "AccessBuildingCommand",
    { subjectSubset: ["Student"] },
  );

  const withCmdAndTpl: ConfigIndex = {
    ...withCmd,
    abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", abstractTplEntry]]),
  };

  it("writes to the same file as the grandparent Command", () => {
    const project = makeProject();
    const result = emitCmd.run(stratEntry, ctx(withCmdAndTpl, project));
    expect(result.targetFile).toBe("commands/access-building.ts");
  });

  it("emits a non-exported class extending the parameterized template with the subject type arg", () => {
    const project = makeProject();
    emitCmd.run(stratEntry, ctx(withCmdAndTpl, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("DepartmentMatch");
    expect(cls.isExported()).toBe(false);
    expect(cls.getExtends()?.getText()).toBe("AccessTemplate<Student>");
  });

  it("extends without type arg when parent template is not parameterized", () => {
    const nonParamTpl = new AbstractTemplateEntry("FlatTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: { StratA: {} },
    });
    const stratA = new StrategyEntry("StratA", "FlatTemplate", "AccessBuildingCommand", {});
    const index: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([["AccessBuildingCommand.FlatTemplate", nonParamTpl]]),
    };
    const project = makeProject();
    emitCmd.run(stratA, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    expect(sf.getClassOrThrow("StratA").getExtends()?.getText()).toBe("FlatTemplate");
  });

  it("extends with union type arg when subjectSubset has multiple members", () => {
    const multiSubsetTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student", "Professor"],
      strategies: { StratA: {} },
    });
    const multiStrat = new StrategyEntry("StratA", "AccessTemplate", "AccessBuildingCommand", {});
    const index: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", multiSubsetTpl]]),
    };
    const project = makeProject();
    emitCmd.run(multiStrat, ctx(index, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("StratA");
    expect(cls.getExtends()?.getText()).toBe("AccessTemplate<Student | Professor>");
    expect(cls.getMethods()).toHaveLength(0);
  });

  it("extends with CommandSubjectUnion when neither strategy nor template has a subjectSubset", () => {
    const noSubsetTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      strategies: { StratA: {} },
    });
    const strat = new StrategyEntry("StratA", "AccessTemplate", "AccessBuildingCommand", {});
    const index: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", noSubsetTpl]]),
    };
    const project = makeProject();
    emitCmd.run(strat, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    expect(sf.getClassOrThrow("StratA").getExtends()?.getText()).toBe(
      "AccessTemplate<CommandSubjectUnion<AccessBuildingCommand>>",
    );
    const codasconImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue() === "codascon");
    expect(codasconImp?.getNamedImports().map((n) => n.getName())).toContain("CommandSubjectUnion");
  });

  it("extends with CommandSubjectUnion when strategy and template both have empty subjectSubset array", () => {
    const emptySubsetTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: [],
      strategies: { StratA: {} },
    });
    const strat = new StrategyEntry("StratA", "AccessTemplate", "AccessBuildingCommand", {
      subjectSubset: [],
    });
    const index: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", emptySubsetTpl]]),
    };
    const project = makeProject();
    emitCmd.run(strat, ctx(index, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("StratA");
    expect(cls.getExtends()?.getText()).toBe(
      "AccessTemplate<CommandSubjectUnion<AccessBuildingCommand>>",
    );
  });

  it("extends with template's subjectSubset when strategy's subjectSubset is empty array", () => {
    const tplWithSubset = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student"],
      strategies: { StratA: {} },
    });
    const strat = new StrategyEntry("StratA", "AccessTemplate", "AccessBuildingCommand", {
      subjectSubset: [],
    });
    const index: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", tplWithSubset]]),
    };
    const project = makeProject();
    emitCmd.run(strat, ctx(index, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("StratA");
    expect(cls.getExtends()?.getText()).toBe("AccessTemplate<Student>");
  });

  it("emits no execute method and no hook properties when strategy has no overrides", () => {
    const project = makeProject();
    emitCmd.run(stratEntry, ctx(withCmdAndTpl, project));
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("DepartmentMatch");
    expect(cls.getProperties()).toHaveLength(0);
    expect(cls.getMethods()).toHaveLength(0);
  });

  it("emits hook override properties when strategy declares commandHooks", () => {
    const auditCmd = new CommandEntry("StrictAuditCommand", {
      commandName: "audit",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "GrantAccess" },
      templates: { GrantAccess: { isParameterized: false, strategies: {} } },
    });
    const tplWithHook = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student"],
      commandHooks: { audit: "AuditCommand" },
      strategies: { DepartmentMatch: {} },
    });
    const stratWithOverride = new StrategyEntry(
      "DepartmentMatch",
      "AccessTemplate",
      "AccessBuildingCommand",
      {
        subjectSubset: ["Student"],
        commandHooks: { audit: "StrictAuditCommand" },
      },
    );
    const index: ConfigIndex = {
      ...withCmd,
      commands: new Map([
        ["AccessBuildingCommand", cmdEntry],
        ["StrictAuditCommand", auditCmd],
      ]),
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", tplWithHook]]),
    };
    const project = makeProject();
    emitCmd.run(stratWithOverride, ctx(index, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("readonly audit = new StrictAuditCommand()");
    const cls = project
      .getSourceFileOrThrow("commands/access-building.ts")
      .getClassOrThrow("DepartmentMatch");
    expect(cls.getMethods()).toHaveLength(0);
  });

  it("imports subject, returnType and objectType from declared sources in configIndex.typeImports", () => {
    // Parallel to the AbstractTemplateEmitter test: same importSrc.has() ternaries but in
    // StrategyClassEmitter — each type is routed to its declared source.
    const index: ConfigIndex = {
      typeImports: { "external-pkg": ["Student", "AccessResult", "Building"] },
      namespace: undefined,
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", professor],
      ]),
      plainTypes: new Map([
        ["Building", building],
        ["AccessResult", accessResult],
      ]),
      commands: new Map([["AccessBuildingCommand", cmdEntry]]),
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", abstractTplEntry]]),
      strategies: new Map(),
      middlewareCommands: new Map(),
      middlewareTemplates: new Map(),
      middlewareStrategies: new Map(),
    };
    const project = makeProject();
    emitCmd.run(stratEntry, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const extImp = sf
      .getImportDeclarations()
      .find((d) => d.isTypeOnly() && d.getModuleSpecifierValue() === "external-pkg");
    expect(extImp).toBeDefined();
    const importedNames = extImp!.getNamedImports().map((n) => n.getName());
    expect(importedNames).toContain("Student");
    expect(importedNames).toContain("AccessResult");
    expect(importedNames).toContain("Building");
  });
});

// ═══════════════════════════════════════════════════════════════════
// emitAst — orchestration
// ═══════════════════════════════════════════════════════════════════

describe("emitAst", () => {
  it("returns one EmitResult per entry across all maps", () => {
    const tplEntry = new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: {},
    });
    const index: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([["AccessBuildingCommand.GrantAccess", tplEntry]]),
    };
    const project = makeProject();
    // subjectTypes(2) + plainTypes(3) + commands(1) + abstractTemplates(1)
    const results = emitAst(index, { configIndex: index, project });
    expect(results).toHaveLength(7);
  });

  it("accumulates all domain types into domain-types.ts", () => {
    const project = makeProject();
    emitAst(withTypes, { configIndex: withTypes, project });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    expect(sf.getClass("Student")).toBeDefined();
    expect(sf.getClass("Professor")).toBeDefined();
    expect(sf.getInterface("Person")).toBeDefined();
    expect(sf.getInterface("Building")).toBeDefined();
    expect(sf.getInterface("AccessResult")).toBeDefined();
  });

  it("routes command and template declarations into the correct command file", () => {
    const abstractTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student"],
      strategies: { DepartmentMatch: {} },
    });
    const nonParameterizedTpl = new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: {},
    });
    const stratEntry = new StrategyEntry(
      "DepartmentMatch",
      "AccessTemplate",
      "AccessBuildingCommand",
      { subjectSubset: ["Student"] },
    );
    const index: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([
        ["AccessBuildingCommand.AccessTemplate", abstractTpl],
        ["AccessBuildingCommand.GrantAccess", nonParameterizedTpl],
      ]),
      strategies: new Map([["AccessBuildingCommand.AccessTemplate.DepartmentMatch", stratEntry]]),
    };
    const project = makeProject();
    emitAst(index, { configIndex: index, project });
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    expect(sf.getClass("AccessBuildingCommand")).toBeDefined();
    expect(sf.getClass("AccessTemplate")).toBeDefined();
    expect(sf.getClass("GrantAccess")).toBeDefined();
    expect(sf.getClass("DepartmentMatch")).toBeDefined();
  });

  it("each strategy adds exactly one result and routes to the grandparent command's file", () => {
    const abstractTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student"],
      strategies: { DepartmentMatch: {} },
    });
    const stratEntry = new StrategyEntry(
      "DepartmentMatch",
      "AccessTemplate",
      "AccessBuildingCommand",
      { subjectSubset: ["Student"] },
    );
    const baseIndex: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", abstractTpl]]),
    };
    const indexWithStrat: ConfigIndex = {
      ...baseIndex,
      strategies: new Map([["AccessBuildingCommand.AccessTemplate.DepartmentMatch", stratEntry]]),
    };

    const baseResults = emitAst(baseIndex, { configIndex: baseIndex, project: makeProject() });
    const stratProject = makeProject();
    const stratResults = emitAst(indexWithStrat, {
      configIndex: indexWithStrat,
      project: stratProject,
    });

    // Strategy adds exactly one result
    expect(stratResults).toHaveLength(baseResults.length + 1);
    // That result routes to the grandparent command's file (strategies are emitted last)
    expect(stratResults.at(-1)!.targetFile).toBe("commands/access-building.ts");
    // The class was written to that file
    expect(
      stratProject.getSourceFileOrThrow("commands/access-building.ts").getClass("DepartmentMatch"),
    ).toBeDefined();
  });

  it("routes two commands into two separate files", () => {
    const feedCmd = new CommandEntry("FeedCommand", {
      commandName: "feed",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "GrantAccess" },
      templates: { GrantAccess: { isParameterized: false, strategies: {} } },
    });
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map([
        ["AccessBuildingCommand", cmdEntry],
        ["FeedCommand", feedCmd],
      ]),
    };
    const project = makeProject();
    // subjectTypes(2) + plainTypes(3) + commands(2) = 7 results
    const results = emitAst(index, { configIndex: index, project });
    expect(results).toHaveLength(7);
    expect(project.getSourceFile("commands/access-building.ts")).toBeDefined();
    expect(project.getSourceFile("commands/feed.ts")).toBeDefined();
  });

  it("uses the namespace when routing command files", () => {
    const index: ConfigIndex = { ...withCmd, namespace: "campus" };
    const project = makeProject();
    emitAst(index, { configIndex: index, project });
    expect(project.getSourceFile("campus/commands/access-building.ts")).toBeDefined();
    expect(project.getSourceFile("commands/access-building.ts")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// TypeScript diagnostics — AST quality gate (pre-Load)
//
// Checks the in-memory Project immediately after emitAst, before any
// disk I/O. Errors here should abort the pipeline (writeFiles or a
// future mergeFiles must not be called on a type-unsound AST).
//
// The Load namespace has an equivalent gate for post-merge validation.
// Both gates are necessary:
//   - This gate catches pure codegen errors.
//   - The Load gate catches errors introduced during merge (e.g. a
//     user-edited body that conflicts with newly generated structure).
//
// Filter strategy: TS2307 ("Cannot find module X") is always present
// in the virtual file system — external packages are not installed
// there. Everything else (notably TS2304/TS2552, "Cannot find name X")
// is a genuine codegen error.
// ═══════════════════════════════════════════════════════════════════

const MODULE_NOT_FOUND = 2307;

describe("TypeScript diagnostics (pre-Load AST gate)", () => {
  it("no unresolved names when imports are declared", () => {
    const index = idx({
      typeImports: { "external-module": ["ExternalType"] },
      subjectTypes: new Map([["Foo", new SubjectTypeEntry("Foo", { resolverName: "resolveFoo" })]]),
    });
    const project = makeProject();
    emitAst(index, { configIndex: index, project });

    const diagnostics = project
      .getPreEmitDiagnostics()
      .filter((d) => d.getCode() !== MODULE_NOT_FOUND);

    expect(diagnostics).toHaveLength(0);
  });

  it("no unresolved names when emitting a full hierarchy with no imports declared", () => {
    // Regression guard: field types are not emitted, so referencing a domain type
    // name should never produce TS2304 ("Cannot find name X"). If a future emitter
    // starts emitting field-typed content this test will catch it immediately.
    const abstractTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student"],
      strategies: { DepartmentMatch: {} },
    });
    const nonParameterizedTpl = new AbstractTemplateEntry("GrantAccess", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: {},
    });
    const stratEntry = new StrategyEntry(
      "DepartmentMatch",
      "AccessTemplate",
      "AccessBuildingCommand",
      {},
    );
    const fullIndex: ConfigIndex = {
      ...withCmd,
      abstractTemplates: new Map([
        ["AccessBuildingCommand.AccessTemplate", abstractTpl],
        ["AccessBuildingCommand.GrantAccess", nonParameterizedTpl],
      ]),
      strategies: new Map([["AccessBuildingCommand.AccessTemplate.DepartmentMatch", stratEntry]]),
    };
    const project = makeProject();
    emitAst(fullIndex, { configIndex: fullIndex, project });

    const diagnostics = project
      .getPreEmitDiagnostics()
      .filter((d) => d.getCode() !== MODULE_NOT_FOUND);

    expect(diagnostics).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Shared middleware fixtures
// ═══════════════════════════════════════════════════════════════════

const rock = new SubjectTypeEntry("Rock", { resolverName: "resolveRock" });
const gem = new SubjectTypeEntry("Gem", { resolverName: "resolveGem" });
const ctxType = new PlainTypeEntry("Ctx", {});
const resType = new PlainTypeEntry("Res", {});

const withMwTypes = idx({
  subjectTypes: new Map([
    ["Rock", rock],
    ["Gem", gem],
  ]),
  plainTypes: new Map([
    ["Ctx", ctxType],
    ["Res", resType],
  ]),
});

const traceMwEntry = new MiddlewareCommandEntry("TraceMiddleware", {
  commandName: "trace",
  baseType: "Ctx",
  objectType: "Ctx",
  returnType: "Res",
  subjectUnion: ["Rock", "Gem"],
  dispatch: { Rock: "TraceRockDefault", Gem: "TraceGemDefault" },
  templates: {
    TraceRock: { isParameterized: false, strategies: { TraceRockDefault: {} } },
    TraceGem: { isParameterized: false, strategies: { TraceGemDefault: {} } },
  },
});

const withMwCmd: ConfigIndex = {
  ...withMwTypes,
  middlewareCommands: new Map([["TraceMiddleware", traceMwEntry]]),
};

// ═══════════════════════════════════════════════════════════════════
// MiddlewareCommandClassEmitter
// ═══════════════════════════════════════════════════════════════════

describe("MiddlewareCommandClassEmitter", () => {
  it("returns targetFile in commands/ matching the middleware key", () => {
    const project = makeProject();
    const result = emitCmd.run(traceMwEntry, ctx(withMwCmd, project));
    expect(result.targetFile).toBe("commands/trace-middleware.ts");
  });

  it("emits an exported class extending MiddlewareCommand with generics", () => {
    const project = makeProject();
    emitCmd.run(traceMwEntry, ctx(withMwCmd, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceMiddleware");
    expect(cls.isExported()).toBe(true);
    expect(cls.getExtends()?.getText()).toContain("MiddlewareCommand<Ctx, Ctx, Res, [Rock, Gem]>");
  });

  it("emits readonly commandName with the correct literal", () => {
    const project = makeProject();
    emitCmd.run(traceMwEntry, ctx(withMwCmd, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceMiddleware");
    const prop = cls.getPropertyOrThrow("commandName");
    expect(prop.getInitializer()?.getText()).toBe('"trace" as const');
  });

  it("emits one resolver method per subject with MiddlewareTemplate return type", () => {
    const project = makeProject();
    emitCmd.run(traceMwEntry, ctx(withMwCmd, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceMiddleware");
    const resolveRock = cls.getMethodOrThrow("resolveRock");
    expect(resolveRock.getReturnTypeNode()?.getText()).toBe(
      "MiddlewareTemplate<TraceMiddleware, [], Rock>",
    );
    const resolveGem = cls.getMethodOrThrow("resolveGem");
    expect(resolveGem.getReturnTypeNode()?.getText()).toBe(
      "MiddlewareTemplate<TraceMiddleware, [], Gem>",
    );
  });

  it("imports MiddlewareCommand as value and MiddlewareTemplate as type from codascon", () => {
    const project = makeProject();
    emitCmd.run(traceMwEntry, ctx(withMwCmd, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const valueImport = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === "codascon" && !d.isTypeOnly());
    expect(valueImport?.getNamedImports().map((n) => n.getName())).toContain("MiddlewareCommand");
    const typeImport = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === "codascon" && d.isTypeOnly());
    expect(typeImport?.getNamedImports().map((n) => n.getName())).toContain("MiddlewareTemplate");
  });

  it("emits private readonly singleton fields for each unique dispatch target", () => {
    const project = makeProject();
    emitCmd.run(traceMwEntry, ctx(withMwCmd, project));
    const cls = project
      .getSourceFileOrThrow("commands/trace-middleware.ts")
      .getClassOrThrow("TraceMiddleware");
    // dispatch: Rock → "TraceRockDefault" → traceRockDefault
    //           Gem  → "TraceGemDefault"  → traceGemDefault
    const rockField = cls.getPropertyOrThrow("traceRockDefault");
    expect(rockField.isReadonly()).toBe(true);
    expect(rockField.getInitializer()?.getText()).toBe("new TraceRockDefault()");
    const gemField = cls.getPropertyOrThrow("traceGemDefault");
    expect(gemField.isReadonly()).toBe(true);
    expect(gemField.getInitializer()?.getText()).toBe("new TraceGemDefault()");
  });

  it("resolver stubs return the singleton field instead of throwing", () => {
    const project = makeProject();
    emitCmd.run(traceMwEntry, ctx(withMwCmd, project));
    const cls = project
      .getSourceFileOrThrow("commands/trace-middleware.ts")
      .getClassOrThrow("TraceMiddleware");
    expect(cls.getMethodOrThrow("resolveRock").getBodyText()).toContain(
      "return this.traceRockDefault",
    );
    expect(cls.getMethodOrThrow("resolveGem").getBodyText()).toContain(
      "return this.traceGemDefault",
    );
  });

  it("emits defaultResolver property initialised to the named strategy singleton", () => {
    const drMwEntry = new MiddlewareCommandEntry("TraceMiddleware", {
      ...traceMwEntry.config,
      defaultResolver: "TraceRockDefault",
    });
    const project = makeProject();
    emitCmd.run(drMwEntry, ctx(withMwCmd, project));
    const cls = project
      .getSourceFileOrThrow("commands/trace-middleware.ts")
      .getClassOrThrow("TraceMiddleware");
    const prop = cls.getPropertyOrThrow("defaultResolver");
    expect(prop.isReadonly()).toBe(true);
    expect(prop.getTypeNode()?.getText()).toBe("TraceRockDefault");
    expect(prop.getInitializer()?.getText()).toContain("this.traceRockDefault");
    // singleton deduplication: TraceRockDefault already in dispatch — only one field
    const singletonProps = cls.getProperties().filter((p) => p.getName() === "traceRockDefault");
    expect(singletonProps).toHaveLength(1);
  });

  it("skips resolver stub for subjects absent from dispatch when defaultResolver is declared", () => {
    // Gem is in subjectUnion but NOT in dispatch — defaultResolver handles it.
    // The emitter must not generate a resolveGem stub; only resolveRock is emitted.
    const drMwEntry = new MiddlewareCommandEntry("TraceMiddleware", {
      ...traceMwEntry.config,
      dispatch: { Rock: "TraceRockDefault" }, // Gem intentionally absent
      defaultResolver: "TraceRockDefault",
    });
    const project = makeProject();
    emitCmd.run(drMwEntry, ctx(withMwCmd, project));
    const cls = project
      .getSourceFileOrThrow("commands/trace-middleware.ts")
      .getClassOrThrow("TraceMiddleware");
    // Rock has a dispatch entry — its resolver stub must be emitted
    expect(cls.getMethod("resolveRock")).toBeDefined();
    // Gem has no dispatch entry — its resolver stub must NOT be emitted
    expect(cls.getMethod("resolveGem")).toBeUndefined();
    // defaultResolver property must still be emitted and be readonly
    expect(cls.getProperty("defaultResolver")?.isReadonly()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MiddlewareAbstractTemplateEmitter — isParameterized: true
// ═══════════════════════════════════════════════════════════════════

describe("MiddlewareAbstractTemplateEmitter — isParameterized: true", () => {
  const mwTplEntry = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
    isParameterized: true,
    subjectSubset: ["Rock"],
    strategies: { TraceRockDefault: {} },
  });

  const mwTplIndex: ConfigIndex = {
    ...withMwCmd,
    middlewareTemplates: new Map([["TraceMiddleware.TraceRock", mwTplEntry]]),
  };

  it("writes to the same file as the parent middleware command", () => {
    const project = makeProject();
    const result = emitCmd.run(mwTplEntry, ctx(mwTplIndex, project));
    expect(result.targetFile).toBe("commands/trace-middleware.ts");
  });

  it("emits a non-exported abstract class with a SU type parameter constrained to the subjectSubset", () => {
    const project = makeProject();
    emitCmd.run(mwTplEntry, ctx(mwTplIndex, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRock");
    expect(cls.isExported()).toBe(false);
    expect(cls.isAbstract()).toBe(true);
    expect(cls.getTypeParameters()[0].getText()).toBe("SU extends Rock");
  });

  it("implements MiddlewareTemplate<ParentKey, [], SU> in the parameterized case", () => {
    const project = makeProject();
    emitCmd.run(mwTplEntry, ctx(mwTplIndex, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRock");
    expect(cls.getImplements()[0].getText()).toBe("MiddlewareTemplate<TraceMiddleware, [], SU>");
  });

  it("emits a 3-arg execute with inner: Runnable<SU, O, R>", () => {
    const project = makeProject();
    emitCmd.run(mwTplEntry, ctx(mwTplIndex, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRock");
    const exec = cls.getMethodOrThrow("execute");
    const params = exec.getParameters();
    expect(params[0].getName()).toBe("subject");
    expect(params[0].getTypeNode()?.getText()).toBe("SU");
    expect(params[1].getName()).toBe("object");
    expect(params[2].getName()).toBe("inner");
    expect(params[2].getTypeNode()?.getText()).toBe("Runnable<SU, Ctx, Res>");
  });

  it("imports Runnable as type from codascon", () => {
    const project = makeProject();
    emitCmd.run(mwTplEntry, ctx(mwTplIndex, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const typeImport = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === "codascon" && d.isTypeOnly());
    expect(typeImport?.getNamedImports().map((n) => n.getName())).toContain("Runnable");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MiddlewareAbstractTemplateEmitter — isParameterized: false
// ═══════════════════════════════════════════════════════════════════

describe("MiddlewareAbstractTemplateEmitter — isParameterized: false", () => {
  const mwFixedTplEntry = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
    isParameterized: false,
    subjectSubset: ["Rock"],
    strategies: { TraceRockDefault: {} },
  });

  const mwFixedTplIndex: ConfigIndex = {
    ...withMwCmd,
    middlewareTemplates: new Map([["TraceMiddleware.TraceRock", mwFixedTplEntry]]),
  };

  it("has no type parameter when not isParameterized", () => {
    const project = makeProject();
    emitCmd.run(mwFixedTplEntry, ctx(mwFixedTplIndex, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRock");
    expect(cls.getTypeParameters()).toHaveLength(0);
  });

  it("implements MiddlewareTemplate with the concrete subject union (not SU)", () => {
    const project = makeProject();
    emitCmd.run(mwFixedTplEntry, ctx(mwFixedTplIndex, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRock");
    expect(cls.getImplements()[0].getText()).toBe("MiddlewareTemplate<TraceMiddleware, [], Rock>");
  });

  it("execute inner parameter uses the concrete SU type, not SU", () => {
    const project = makeProject();
    emitCmd.run(mwFixedTplEntry, ctx(mwFixedTplIndex, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRock");
    const exec = cls.getMethodOrThrow("execute");
    const innerParam = exec.getParameters()[2];
    expect(innerParam.getTypeNode()?.getText()).toBe("Runnable<Rock, Ctx, Res>");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MiddlewareStrategyClassEmitter
// ═══════════════════════════════════════════════════════════════════

describe("MiddlewareStrategyClassEmitter", () => {
  const mwTplFixed = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
    isParameterized: false,
    strategies: { TraceRockDefault: {} },
  });
  const mwTplParam = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
    isParameterized: true,
    subjectSubset: ["Rock"],
    strategies: { TraceRockDefault: {} },
  });

  it("extends parent template without type arg when parent is not parameterized", () => {
    const stratEntry = new MiddlewareStrategyEntry(
      "TraceRockDefault",
      "TraceRock",
      "TraceMiddleware",
      {},
    );
    const index: ConfigIndex = {
      ...withMwCmd,
      middlewareTemplates: new Map([["TraceMiddleware.TraceRock", mwTplFixed]]),
      middlewareStrategies: new Map([["TraceMiddleware.TraceRock.TraceRockDefault", stratEntry]]),
    };
    const project = makeProject();
    emitCmd.run(stratEntry, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRockDefault");
    expect(cls.getExtends()?.getText()).toBe("TraceRock");
  });

  it("extends parent template with subject type arg when parent is parameterized", () => {
    const stratEntry = new MiddlewareStrategyEntry(
      "TraceRockDefault",
      "TraceRock",
      "TraceMiddleware",
      {},
    );
    const index: ConfigIndex = {
      ...withMwCmd,
      middlewareTemplates: new Map([["TraceMiddleware.TraceRock", mwTplParam]]),
      middlewareStrategies: new Map([["TraceMiddleware.TraceRock.TraceRockDefault", stratEntry]]),
    };
    const project = makeProject();
    emitCmd.run(stratEntry, ctx(index, project));
    const sf = project.getSourceFileOrThrow("commands/trace-middleware.ts");
    const cls = sf.getClassOrThrow("TraceRockDefault");
    expect(cls.getExtends()?.getText()).toBe("TraceRock<Rock>");
  });

  it("writes to the same file as the parent middleware command", () => {
    const stratEntry = new MiddlewareStrategyEntry(
      "TraceRockDefault",
      "TraceRock",
      "TraceMiddleware",
      {},
    );
    const index: ConfigIndex = {
      ...withMwCmd,
      middlewareTemplates: new Map([["TraceMiddleware.TraceRock", mwTplFixed]]),
      middlewareStrategies: new Map([["TraceMiddleware.TraceRock.TraceRockDefault", stratEntry]]),
    };
    const project = makeProject();
    const result = emitCmd.run(stratEntry, ctx(index, project));
    expect(result.targetFile).toBe("commands/trace-middleware.ts");
  });
});

// ═══════════════════════════════════════════════════════════════════
// CommandClassEmitter — middleware getter
// ═══════════════════════════════════════════════════════════════════

describe("CommandClassEmitter — middleware getter", () => {
  const mineCmd = new CommandEntry("MineCommand", {
    commandName: "mine",
    baseType: "Ctx",
    objectType: "Ctx",
    returnType: "Res",
    subjectUnion: ["Rock"],
    dispatch: { Rock: "RockMinerDefault" },
    templates: { RockMiner: { isParameterized: false, strategies: { RockMinerDefault: {} } } },
    middleware: ["TraceMiddleware"],
  });

  const mineIndex: ConfigIndex = {
    ...withMwTypes,
    commands: new Map([["MineCommand", mineCmd]]),
    middlewareCommands: new Map([["TraceMiddleware", traceMwEntry]]),
  };

  it("emits override get middleware() when config.middleware is set", () => {
    const project = makeProject();
    emitCmd.run(mineCmd, ctx(mineIndex, project));
    const sf = project.getSourceFileOrThrow("commands/mine.ts");
    const cls = sf.getClassOrThrow("MineCommand");
    const getter = cls.getGetAccessor("middleware");
    expect(getter).toBeDefined();
    expect(getter?.hasModifier("override" as Parameters<typeof getter.hasModifier>[0])).toBe(true);
  });

  it("middleware getter returns an array of new middleware instances", () => {
    const project = makeProject();
    emitCmd.run(mineCmd, ctx(mineIndex, project));
    const sf = project.getSourceFileOrThrow("commands/mine.ts");
    const cls = sf.getClassOrThrow("MineCommand");
    const getter = cls.getGetAccessorOrThrow("middleware");
    const body = getter.getBodyText();
    expect(body).toContain("new TraceMiddleware()");
  });

  it("imports the middleware class as a value import", () => {
    const project = makeProject();
    emitCmd.run(mineCmd, ctx(mineIndex, project));
    const sf = project.getSourceFileOrThrow("commands/mine.ts");
    const valueImports = sf
      .getImportDeclarations()
      .filter((d) => !d.isTypeOnly())
      .flatMap((d) => d.getNamedImports().map((n) => n.getName()));
    expect(valueImports).toContain("TraceMiddleware");
  });

  it("does not emit get middleware() when config.middleware is absent", () => {
    const noMwCmd = new CommandEntry("MineCommand", {
      commandName: "mine",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock"],
      dispatch: { Rock: "RockMinerDefault" },
      templates: { RockMiner: { isParameterized: false, strategies: { RockMinerDefault: {} } } },
    });
    const noMwIndex: ConfigIndex = {
      ...withMwTypes,
      commands: new Map([["MineCommand", noMwCmd]]),
    };
    const project = makeProject();
    emitCmd.run(noMwCmd, ctx(noMwIndex, project));
    const sf = project.getSourceFileOrThrow("commands/mine.ts");
    const cls = sf.getClassOrThrow("MineCommand");
    expect(cls.getGetAccessor("middleware")).toBeUndefined();
  });
});
