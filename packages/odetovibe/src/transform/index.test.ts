/**
 * @codascon/odetovibe — Transform Domain Tests
 *
 * Covers:
 *   - SubjectClassEmitter: minimal stub — extends Subject + visitName only
 *   - InterfaceEmitter: empty stub — name only, content is user-owned
 *   - CommandClassEmitter: class generics, commandName, visit methods, file path, imports
 *   - AbstractTemplateEmitter: abstract class, type parameter, implements, hooks, execute
 *   - ConcreteTemplateEmitter: concrete class, implements, hooks, execute stub
 *   - StrategyClassEmitter: extends clause, hook overrides, file path
 *   - emitAst: orchestration, file accumulation, namespace routing
 */

import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import {
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  ConcreteTemplateEntry,
  StrategyEntry,
} from "../extract/domain-types.js";
import type { ConfigIndex } from "../extract/domain-types.js";
import { emitAst, EmitAstCommand } from "./index.js";
import type { EmitContext } from "./index.js";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function makeProject(): Project {
  return new Project({ useInMemoryFileSystem: true });
}

function idx(overrides: Partial<ConfigIndex> = {}): ConfigIndex {
  return {
    namespace: undefined,
    imports: {},
    externalTypeKeys: new Set(),
    subjectTypes: new Map(),
    plainTypes: new Map(),
    commands: new Map(),
    abstractTemplates: new Map(),
    concreteTemplates: new Map(),
    strategies: new Map(),
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

const student = new SubjectTypeEntry("Student", { visitName: "resolveStudent" });
const professor = new SubjectTypeEntry("Professor", { visitName: "resolveProfessor" });
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

  it("emits readonly visitName property with the correct literal", () => {
    const project = makeProject();
    emitCmd.run(student, ctx(idx(), project));
    const t = text(project, "domain-types.ts");
    expect(t).toContain('readonly visitName = "resolveStudent" as const');
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

  it("emits one visit method per subject with correct signature", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessBuildingCommand");
    const methods = cls.getMethods();
    const methodNames = methods.map((m) => m.getName());
    expect(methodNames).toContain("resolveStudent");
    expect(methodNames).toContain("resolveProfessor");
  });

  it("visit methods have the correct return type and @odetovibe-generated stub", () => {
    const project = makeProject();
    emitCmd.run(cmdEntry, ctx(withTypes, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("Template<AccessBuildingCommand, [], Student>");
    expect(t).toContain("Template<AccessBuildingCommand, [], Professor>");
    expect(t).toContain("@odetovibe-generated");
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
});

// ═══════════════════════════════════════════════════════════════════
// AbstractTemplateEmitter
// ═══════════════════════════════════════════════════════════════════

describe("AbstractTemplateEmitter", () => {
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

  it("emits an exported abstract class", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessTemplate");
    expect(cls.isExported()).toBe(true);
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

  it("implements Template<Command, [], SubjectUnion> in the non-parameterized case", () => {
    const nonParam = new AbstractTemplateEntry("FlatTemplate", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: { StratA: {} },
    });
    const project = makeProject();
    emitCmd.run(nonParam, ctx(withCmd, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("Template<AccessBuildingCommand, [], Student | Professor>");
  });

  it("emits an abstract execute method with correct params and return type", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("AccessTemplate");
    const execute = cls.getMethodOrThrow("execute");
    expect(execute.isAbstract()).toBe(true);
    expect(execute.getReturnTypeNode()?.getText()).toBe("AccessResult");
    const params = execute.getParameters();
    expect(params[0].getName()).toBe("subject");
    expect(params[1].getName()).toBe("object");
    expect(params[1].getTypeNode()?.getText()).toBe("Readonly<Building>");
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
    expect(t).toContain("Template<AccessBuildingCommand, [AuditCommand], Student | Professor>");
    // AuditCommand must be imported as a value
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const hookImp = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue().includes("audit") && !d.isTypeOnly());
    expect(hookImp?.getNamedImports().map((n) => n.getName())).toContain("AuditCommand");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ConcreteTemplateEmitter
// ═══════════════════════════════════════════════════════════════════

describe("ConcreteTemplateEmitter", () => {
  const tplEntry = new ConcreteTemplateEntry("GrantAccess", "AccessBuildingCommand", {
    isParameterized: false,
    strategies: {},
  });

  it("writes to the same file as its parent Command", () => {
    const project = makeProject();
    const result = emitCmd.run(tplEntry, ctx(withCmd, project));
    expect(result.targetFile).toBe("commands/access-building.ts");
  });

  it("emits an exported non-abstract class", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("GrantAccess");
    expect(cls.isExported()).toBe(true);
    expect(cls.isAbstract()).toBe(false);
  });

  it("implements Template<Command, [], SubjectUnion> (full union when no subjectSubset)", () => {
    const project = makeProject();
    emitCmd.run(tplEntry, ctx(withCmd, project));
    const t = text(project, "commands/access-building.ts");
    expect(t).toContain("Template<AccessBuildingCommand, [], Student | Professor>");
  });

  it("implements Template with narrowed subjectSubset when subjectSubset is declared", () => {
    const narrowed = new ConcreteTemplateEntry("GrantAccess", "AccessBuildingCommand", {
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
    const tplWithHook = new ConcreteTemplateEntry("GrantAccess", "AccessBuildingCommand", {
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

  it("emits an exported class extending the parameterized template with the subject type arg", () => {
    const project = makeProject();
    emitCmd.run(stratEntry, ctx(withCmdAndTpl, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("DepartmentMatch");
    expect(cls.isExported()).toBe(true);
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

  it("emits an empty class body when there are no hook overrides", () => {
    const project = makeProject();
    emitCmd.run(stratEntry, ctx(withCmdAndTpl, project));
    const sf = project.getSourceFileOrThrow("commands/access-building.ts");
    const cls = sf.getClassOrThrow("DepartmentMatch");
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
  });
});

// ═══════════════════════════════════════════════════════════════════
// emitAst — orchestration
// ═══════════════════════════════════════════════════════════════════

describe("emitAst", () => {
  it("returns one EmitResult per entry across all maps", () => {
    const tplEntry = new ConcreteTemplateEntry("GrantAccess", "AccessBuildingCommand", {
      isParameterized: false,
      strategies: {},
    });
    const index: ConfigIndex = {
      ...withCmd,
      concreteTemplates: new Map([["AccessBuildingCommand.GrantAccess", tplEntry]]),
    };
    const project = makeProject();
    // subjectTypes(2) + plainTypes(3) + commands(1) + concreteTemplates(1)
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
    const concreteTpl = new ConcreteTemplateEntry("GrantAccess", "AccessBuildingCommand", {
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
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", abstractTpl]]),
      concreteTemplates: new Map([["AccessBuildingCommand.GrantAccess", concreteTpl]]),
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
      imports: { "external-module": ["ExternalType"] },
      subjectTypes: new Map([["Foo", new SubjectTypeEntry("Foo", { visitName: "resolveFoo" })]]),
    });
    const project = makeProject();
    emitAst(index, { configIndex: index, project });

    const diagnostics = project
      .getPreEmitDiagnostics()
      .filter((d) => d.getCode() !== MODULE_NOT_FOUND);

    expect(diagnostics).toHaveLength(0);
  });
});
// Note: the "unresolved type when imports omitted" regression test was removed because
// domain type field content is no longer emitted — field types never appear in generated
// code, so there is no code path that could produce TS2304 for a missing domain type import.
