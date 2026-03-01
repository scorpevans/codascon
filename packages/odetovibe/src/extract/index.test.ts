/**
 * @codascon/odetovibe — Extract Domain Tests
 *
 * Covers:
 *   - parseYaml: entry splitting at parse time (SubjectTypeEntry vs PlainTypeEntry,
 *     AbstractTemplateEntry vs ConcreteTemplateEntry, qualified keys, namespace)
 *   - ValidateEntryCommand: all validation rules across all six validators
 *   - validateYaml: end-to-end orchestration
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import {
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  ConcreteTemplateEntry,
  StrategyEntry,
  ValidateEntryCommand,
  parseYaml,
  validateYaml,
} from "./index.js";
import type { ConfigIndex } from "./index.js";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Build a ConfigIndex with all-empty maps and optional property overrides. */
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

const validateCmd = new ValidateEntryCommand();

/** Extract just the rule codes from a validation result. */
function rules(result: ReturnType<typeof validateCmd.run>): string[] {
  return result.errors.map((e) => e.rule);
}

/** Write YAML content to a temp file, call parseYaml, delete the file. */
function parseYamlString(content: string): ConfigIndex {
  const tmpPath = path.join(os.tmpdir(), `odetovibe-test-${process.hrtime.bigint()}.yaml`);
  fs.writeFileSync(tmpPath, content, "utf-8");
  try {
    return parseYaml(tmpPath);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// ─── Shared entries ──────────────────────────────────────────────────────────

const student = new SubjectTypeEntry("Student", { visitName: "resolveStudent" });
const professor = new SubjectTypeEntry("Professor", { visitName: "resolveProfessor" });
const person = new PlainTypeEntry("Person", {});
const building = new PlainTypeEntry("Building", {});
const accessResult = new PlainTypeEntry("AccessResult", {});

/** Index pre-populated with the shared subject and plain types. */
const withTypes: ConfigIndex = idx({
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

/** Minimal valid command config that references types in withTypes. */
const validCmdConfig = {
  commandName: "accessBuilding",
  baseType: "Person",
  objectType: "Building",
  returnType: "AccessResult",
  subjectUnion: ["Student"],
  dispatch: { Student: "GrantAccess" },
  templates: {
    GrantAccess: { isParameterized: false, strategies: {} },
  },
};

// ═══════════════════════════════════════════════════════════════════
// SubjectTypeValidator
// ═══════════════════════════════════════════════════════════════════

describe("SubjectTypeValidator", () => {
  it("passes for a valid subject type", () => {
    const index = idx({ subjectTypes: new Map([["Student", student]]) });
    expect(validateCmd.run(student, index).valid).toBe(true);
  });

  it("[visitName-prefix] fails when visitName does not start with 'resolve'", () => {
    const entry = new SubjectTypeEntry("Student", { visitName: "visitStudent" });
    const index = idx({ subjectTypes: new Map([["Student", entry]]) });
    expect(rules(validateCmd.run(entry, index))).toContain("visitName-prefix");
  });

  it("[visitName-unique] fails when two subjects share the same visitName", () => {
    const clash = new SubjectTypeEntry("Professor", { visitName: "resolveStudent" });
    const index = idx({
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", clash],
      ]),
    });
    expect(rules(validateCmd.run(student, index))).toContain("visitName-unique");
  });

  it("[visitName-unique] does not flag an entry against its own visitName", () => {
    const index = idx({ subjectTypes: new Map([["Student", student]]) });
    expect(validateCmd.run(student, index).valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PlainTypeValidator
// ═══════════════════════════════════════════════════════════════════

describe("PlainTypeValidator", () => {
  it("always passes — no structural constraints on plain types", () => {
    const index = idx({ plainTypes: new Map([["Building", building]]) });
    expect(validateCmd.run(building, index).valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CommandValidator
// ═══════════════════════════════════════════════════════════════════

describe("CommandValidator", () => {
  function makeCmd(overrides: object) {
    return new CommandEntry("Cmd", { ...validCmdConfig, ...overrides });
  }

  function indexWithCmd(entry: CommandEntry): ConfigIndex {
    return { ...withTypes, commands: new Map([["Cmd", entry]]) };
  }

  it("passes for a valid command", () => {
    const entry = makeCmd({});
    expect(validateCmd.run(entry, indexWithCmd(entry)).valid).toBe(true);
  });

  it("[baseType-ref] fails when baseType is not a known domain type", () => {
    const entry = makeCmd({ baseType: "Unknown" });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("baseType-ref");
  });

  it("[objectType-ref] fails when objectType is not a known domain type", () => {
    const entry = makeCmd({ objectType: "Unknown" });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("objectType-ref");
  });

  it("[returnType-ref] fails when returnType is not a known domain type", () => {
    const entry = makeCmd({ returnType: "Unknown" });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("returnType-ref");
  });

  it("passes when returnAsync is true and returnType is a bare domain type", () => {
    const entry = makeCmd({ returnAsync: true });
    expect(validateCmd.run(entry, indexWithCmd(entry)).valid).toBe(true);
  });

  it("[returnType-ref] fails when returnType uses Promise<T> syntax (use returnAsync instead)", () => {
    const entry = makeCmd({ returnType: "Promise<AccessResult>" });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("returnType-ref");
  });

  it("[subjectUnion-ref] fails when a subjectUnion entry is not a known domain type", () => {
    const entry = makeCmd({ subjectUnion: ["Ghost"], dispatch: { Ghost: "GrantAccess" } });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("subjectUnion-ref");
  });

  it("[subjectUnion-visitName] fails when a subjectUnion entry is a plain type (no visitName)", () => {
    const entry = makeCmd({ subjectUnion: ["Building"], dispatch: { Building: "GrantAccess" } });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("subjectUnion-visitName");
  });

  it("[dispatch-coverage] fails when a subjectUnion member has no dispatch entry", () => {
    const entry = makeCmd({
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "GrantAccess" }, // Professor missing
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-coverage");
  });

  it("[dispatch-extra] fails when a dispatch key is not in subjectUnion", () => {
    const entry = makeCmd({
      dispatch: { Student: "GrantAccess", Professor: "GrantAccess" }, // Professor not in union
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-extra");
  });

  it("[dispatch-target-ref] fails when a bare Template name is not in templates", () => {
    const entry = makeCmd({ dispatch: { Student: "NoSuchTemplate" }, templates: {} });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-target-ref");
  });

  it("[dispatch-target-abstract] fails when a bare dispatch target has strategies (abstract)", () => {
    const entry = makeCmd({
      dispatch: { Student: "AccessTemplate" }, // bare reference to abstract template
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain(
      "dispatch-target-abstract",
    );
  });

  it("[dispatch-target-ref] fails when the Template part of Template.Strategy is not in templates", () => {
    const entry = makeCmd({
      dispatch: { Student: "NoSuchTemplate.SomeStrategy" },
      templates: {},
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-target-ref");
  });

  it("[dispatch-target-strategy] fails when the Strategy part of Template.Strategy is not in the template", () => {
    const entry = makeCmd({
      dispatch: { Student: "AccessTemplate.NoSuchStrategy" },
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain(
      "dispatch-target-strategy",
    );
  });

  it("[dispatch-target-format] fails when dispatch value has more than two dot-separated parts", () => {
    const entry = makeCmd({ dispatch: { Student: "A.B.C" }, templates: {} });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-target-format");
  });
});

// ═══════════════════════════════════════════════════════════════════
// AbstractTemplateValidator
// ═══════════════════════════════════════════════════════════════════

describe("AbstractTemplateValidator", () => {
  // Command that correctly uses Template.Strategy format in dispatch
  const cmdEntry = new CommandEntry("Cmd", {
    commandName: "cmd",
    baseType: "Person",
    objectType: "Building",
    returnType: "AccessResult",
    subjectUnion: ["Student"],
    dispatch: { Student: "AccessTemplate.DepartmentMatch" },
    templates: {
      AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
    },
  });

  const tplEntry = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
    isParameterized: true,
    subjectSubset: ["Student"],
    strategies: { DepartmentMatch: {} },
  });

  function indexWithTemplate(tpl: AbstractTemplateEntry): ConfigIndex {
    return {
      ...withTypes,
      commands: new Map([["Cmd", cmdEntry]]),
      abstractTemplates: new Map([["Cmd.AccessTemplate", tpl]]),
    };
  }

  it("passes for a valid abstract template", () => {
    expect(validateCmd.run(tplEntry, indexWithTemplate(tplEntry)).valid).toBe(true);
  });

  it("[parent-command] fails when parent command is not in ConfigIndex", () => {
    const entry = new AbstractTemplateEntry("AccessTemplate", "MissingCmd", {
      isParameterized: true,
      strategies: { DepartmentMatch: {} },
    });
    expect(rules(validateCmd.run(entry, idx()))).toContain("parent-command");
  });

  it("[subjectSubset] fails when a subjectSubset entry is outside the parent Command's subjectUnion", () => {
    const entry = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: true,
      subjectSubset: ["Professor"], // Professor not in Cmd's subjectUnion ["Student"]
      strategies: { DepartmentMatch: {} },
    });
    expect(rules(validateCmd.run(entry, indexWithTemplate(entry)))).toContain("subjectSubset");
  });

  it("[commandHook-ref] fails when a commandHooks value is not a known Command", () => {
    const entry = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: true,
      commandHooks: { audit: "UnknownAuditCommand" },
      strategies: { DepartmentMatch: {} },
    });
    expect(rules(validateCmd.run(entry, indexWithTemplate(entry)))).toContain("commandHook-ref");
  });

  it("[commandHook-ref] passes when a commandHooks value references a known Command", () => {
    const auditCmd = new CommandEntry("AuditCmd", {
      commandName: "audit",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "GrantAccess" },
      templates: { GrantAccess: { isParameterized: false, strategies: {} } },
    });
    const entry = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: true,
      commandHooks: { audit: "AuditCmd" },
      strategies: { DepartmentMatch: {} },
    });
    const index: ConfigIndex = {
      ...indexWithTemplate(entry),
      commands: new Map([
        ["Cmd", cmdEntry],
        ["AuditCmd", auditCmd],
      ]),
    };
    expect(validateCmd.run(entry, index).valid).toBe(true);
  });

  it("[abstract-in-dispatch] fails when abstract template appears bare in parent Command's dispatch", () => {
    const cmdWithBareDispatch = new CommandEntry("Cmd", {
      commandName: "cmd",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "AccessTemplate" }, // bare — should be AccessTemplate.DepartmentMatch
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map([["Cmd", cmdWithBareDispatch]]),
      abstractTemplates: new Map([["Cmd.AccessTemplate", tplEntry]]),
    };
    expect(rules(validateCmd.run(tplEntry, index))).toContain("abstract-in-dispatch");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ConcreteTemplateValidator
// ═══════════════════════════════════════════════════════════════════

describe("ConcreteTemplateValidator", () => {
  // Command whose dispatch uses a bare Template name (valid for concrete templates)
  const cmdEntry = new CommandEntry("Cmd", {
    commandName: "cmd",
    baseType: "Person",
    objectType: "Building",
    returnType: "AccessResult",
    subjectUnion: ["Student"],
    dispatch: { Student: "GrantAccess" },
    templates: { GrantAccess: { isParameterized: false, strategies: {} } },
  });

  const tplEntry = new ConcreteTemplateEntry("GrantAccess", "Cmd", {
    isParameterized: false,
    strategies: {},
  });

  function indexWithTemplate(tpl: ConcreteTemplateEntry): ConfigIndex {
    return {
      ...withTypes,
      commands: new Map([["Cmd", cmdEntry]]),
      concreteTemplates: new Map([["Cmd.GrantAccess", tpl]]),
    };
  }

  it("passes for a valid concrete template", () => {
    expect(validateCmd.run(tplEntry, indexWithTemplate(tplEntry)).valid).toBe(true);
  });

  it("may appear bare in parent Command's dispatch — no abstract-in-dispatch check", () => {
    // dispatch: { Student: "GrantAccess" } is a bare reference and should not produce an error
    expect(validateCmd.run(tplEntry, indexWithTemplate(tplEntry)).valid).toBe(true);
  });

  it("[parent-command] fails when parent command is not in ConfigIndex", () => {
    const entry = new ConcreteTemplateEntry("GrantAccess", "MissingCmd", {
      isParameterized: false,
      strategies: {},
    });
    expect(rules(validateCmd.run(entry, idx()))).toContain("parent-command");
  });

  it("[subjectSubset] fails when a subjectSubset entry is outside the parent Command's subjectUnion", () => {
    const entry = new ConcreteTemplateEntry("GrantAccess", "Cmd", {
      isParameterized: false,
      subjectSubset: ["Professor"], // Professor not in Cmd's subjectUnion ["Student"]
      strategies: {},
    });
    expect(rules(validateCmd.run(entry, indexWithTemplate(entry)))).toContain("subjectSubset");
  });

  it("[commandHook-ref] fails when a commandHooks value is not a known Command", () => {
    const entry = new ConcreteTemplateEntry("GrantAccess", "Cmd", {
      isParameterized: false,
      commandHooks: { audit: "UnknownAuditCommand" },
      strategies: {},
    });
    expect(rules(validateCmd.run(entry, indexWithTemplate(entry)))).toContain("commandHook-ref");
  });
});

// ═══════════════════════════════════════════════════════════════════
// StrategyValidator
// ═══════════════════════════════════════════════════════════════════

describe("StrategyValidator", () => {
  const auditCmd = new CommandEntry("AuditCmd", {
    commandName: "audit",
    baseType: "Person",
    objectType: "Building",
    returnType: "AccessResult",
    subjectUnion: ["Student"],
    dispatch: { Student: "GrantAccess" },
    templates: { GrantAccess: { isParameterized: false, strategies: {} } },
  });

  const cmdEntry = new CommandEntry("Cmd", {
    commandName: "cmd",
    baseType: "Person",
    objectType: "Building",
    returnType: "AccessResult",
    subjectUnion: ["Student", "Professor"],
    dispatch: {
      Student: "AccessTemplate.DepartmentMatch",
      Professor: "AccessTemplate.DepartmentMatch",
    },
    templates: {
      AccessTemplate: {
        isParameterized: true,
        subjectSubset: ["Student"], // narrows to Student only
        commandHooks: { audit: "AuditCmd" },
        strategies: { DepartmentMatch: {} },
      },
    },
  });

  // Parent abstract template: subjectSubset is ["Student"]
  const tplEntry = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
    isParameterized: true,
    subjectSubset: ["Student"],
    commandHooks: { audit: "AuditCmd" },
    strategies: { DepartmentMatch: {} },
  });

  const stratEntry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
    subjectSubset: ["Student"],
    commandHooks: { audit: "AuditCmd" },
  });

  function baseIndex(): ConfigIndex {
    return {
      ...withTypes,
      commands: new Map([
        ["Cmd", cmdEntry],
        ["AuditCmd", auditCmd],
      ]),
      abstractTemplates: new Map([["Cmd.AccessTemplate", tplEntry]]),
    };
  }

  it("passes for a valid strategy", () => {
    expect(validateCmd.run(stratEntry, baseIndex()).valid).toBe(true);
  });

  it("[parent-template] fails when parent AbstractTemplateEntry is not in ConfigIndex", () => {
    const entry = new StrategyEntry("DepartmentMatch", "NoSuchTemplate", "Cmd", {});
    const index: ConfigIndex = { ...baseIndex(), abstractTemplates: new Map() };
    expect(rules(validateCmd.run(entry, index))).toContain("parent-template");
  });

  it("[subjectSubset-moot] fails when subjectSubset is declared but parent template is not parameterized", () => {
    const nonParamTpl = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: false,
      strategies: { DepartmentMatch: {} },
    });
    const entry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
      subjectSubset: ["Student"], // meaningless when parent is not parameterized
    });
    const index: ConfigIndex = {
      ...baseIndex(),
      abstractTemplates: new Map([["Cmd.AccessTemplate", nonParamTpl]]),
    };
    expect(rules(validateCmd.run(entry, index))).toContain("subjectSubset-moot");
  });

  it("[subjectSubset-parent] fails when subjectSubset entry is outside the parent Template's effective subjectSubset", () => {
    // Parent template's subjectSubset is ["Student"]; strategy declares ["Professor"]
    const entry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
      subjectSubset: ["Professor"],
    });
    expect(rules(validateCmd.run(entry, baseIndex()))).toContain("subjectSubset-parent");
  });

  it("[commandHook-key] fails when a commandHooks key is not declared by the parent Template", () => {
    const entry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
      commandHooks: { logger: "AuditCmd" }, // "logger" not in parent's commandHooks
    });
    expect(rules(validateCmd.run(entry, baseIndex()))).toContain("commandHook-key");
  });

  it("[commandHook-ref] fails when a commandHooks value is not a known Command", () => {
    const entry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
      commandHooks: { audit: "UnknownCommand" }, // "audit" key is valid; Command does not exist
    });
    expect(rules(validateCmd.run(entry, baseIndex()))).toContain("commandHook-ref");
  });
});

// ═══════════════════════════════════════════════════════════════════
// parseYaml — entry splitting at parse time
// ═══════════════════════════════════════════════════════════════════

describe("parseYaml", () => {
  it("places domain types with visitName into subjectTypes", () => {
    const index = parseYamlString(`
domainTypes:
  Student:
    visitName: resolveStudent
commands: {}
`);
    expect(index.subjectTypes.has("Student")).toBe(true);
    expect(index.plainTypes.has("Student")).toBe(false);
    expect(index.subjectTypes.get("Student")?.config.visitName).toBe("resolveStudent");
  });

  it("places domain types without visitName into plainTypes", () => {
    const index = parseYamlString(`
domainTypes:
  Building:
    name: string
commands: {}
`);
    expect(index.plainTypes.has("Building")).toBe(true);
    expect(index.subjectTypes.has("Building")).toBe(false);
  });

  it("places templates with non-empty strategies into abstractTemplates", () => {
    const index = parseYamlString(`
domainTypes:
  Base: {}
  Obj: {}
  Ret: {}
  Subj:
    visitName: resolveSubj
commands:
  MyCmd:
    commandName: myCmd
    baseType: Base
    objectType: Obj
    returnType: Ret
    subjectUnion: [Subj]
    dispatch:
      Subj: MyTemplate.StratA
    templates:
      MyTemplate:
        isParameterized: true
        strategies:
          StratA: {}
`);
    expect(index.abstractTemplates.has("MyCmd.MyTemplate")).toBe(true);
    expect(index.concreteTemplates.has("MyCmd.MyTemplate")).toBe(false);
  });

  it("places templates with empty strategies into concreteTemplates", () => {
    const index = parseYamlString(`
domainTypes:
  Base: {}
  Obj: {}
  Ret: {}
  Subj:
    visitName: resolveSubj
commands:
  MyCmd:
    commandName: myCmd
    baseType: Base
    objectType: Obj
    returnType: Ret
    subjectUnion: [Subj]
    dispatch:
      Subj: GrantAccess
    templates:
      GrantAccess:
        isParameterized: false
        strategies: {}
`);
    expect(index.concreteTemplates.has("MyCmd.GrantAccess")).toBe(true);
    expect(index.abstractTemplates.has("MyCmd.GrantAccess")).toBe(false);
  });

  it("keys strategies as CommandName.TemplateName.StrategyName", () => {
    const index = parseYamlString(`
domainTypes:
  Base: {}
  Obj: {}
  Ret: {}
  Subj:
    visitName: resolveSubj
commands:
  MyCmd:
    commandName: myCmd
    baseType: Base
    objectType: Obj
    returnType: Ret
    subjectUnion: [Subj]
    dispatch:
      Subj: MyTemplate.StratA
    templates:
      MyTemplate:
        isParameterized: true
        strategies:
          StratA: {}
`);
    expect(index.strategies.has("MyCmd.MyTemplate.StratA")).toBe(true);
  });

  it("captures the namespace when present", () => {
    const index = parseYamlString(`
namespace: campus
domainTypes: {}
commands: {}
`);
    expect(index.namespace).toBe("campus");
  });

  it("leaves namespace undefined when absent", () => {
    const index = parseYamlString(`
domainTypes: {}
commands: {}
`);
    expect(index.namespace).toBeUndefined();
  });

  it("handles bare-key domainTypes (null value) as plain types without throwing", () => {
    // After YAML cleanup, entries with no sub-keys parse as null in js-yaml:
    //   domainTypes:
    //     ConfigEntry:       ← js-yaml produces null, not {}
    //     SubjectType:
    //       visitName: resolveSubjectType
    const index = parseYamlString(`
domainTypes:
  ConfigEntry:
  SubjectType:
    visitName: resolveSubjectType
commands: {}
`);
    expect(index.plainTypes.has("ConfigEntry")).toBe(true);
    expect(index.subjectTypes.has("SubjectType")).toBe(true);
  });

  it("handles bare-key externalTypes (null value) without throwing", () => {
    const index = parseYamlString(`
externalTypes:
  BaseEntry:
  SubjectExt:
    visitName: resolveSubjectExt
domainTypes: {}
commands: {}
`);
    expect(index.plainTypes.has("BaseEntry")).toBe(true);
    expect(index.subjectTypes.has("SubjectExt")).toBe(true);
    expect(index.externalTypeKeys.has("BaseEntry")).toBe(true);
    expect(index.externalTypeKeys.has("SubjectExt")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// validateYaml — end-to-end
// ═══════════════════════════════════════════════════════════════════

describe("validateYaml", () => {
  it("returns valid:true for a fully valid ConfigIndex", () => {
    const cmdEntry = new CommandEntry("Cmd", validCmdConfig);
    const tplEntry = new ConcreteTemplateEntry("GrantAccess", "Cmd", {
      isParameterized: false,
      strategies: {},
    });
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map([["Cmd", cmdEntry]]),
      concreteTemplates: new Map([["Cmd.GrantAccess", tplEntry]]),
    };
    const result = validateYaml(index);
    expect(result.valid).toBe(true);
    expect(result.configIndex).toBe(index);
  });

  it("returns valid:false when any entry fails", () => {
    const s1 = new SubjectTypeEntry("Student", { visitName: "resolvePerson" });
    const s2 = new SubjectTypeEntry("Professor", { visitName: "resolvePerson" });
    const index = idx({
      subjectTypes: new Map([
        ["Student", s1],
        ["Professor", s2],
      ]),
    });
    expect(validateYaml(index).valid).toBe(false);
  });

  it("collects errors from all failing entries", () => {
    // Both subjects share a visitName — both report visitName-unique
    const s1 = new SubjectTypeEntry("Student", { visitName: "resolvePerson" });
    const s2 = new SubjectTypeEntry("Professor", { visitName: "resolvePerson" });
    const index = idx({
      subjectTypes: new Map([
        ["Student", s1],
        ["Professor", s2],
      ]),
    });
    const result = validateYaml(index);
    const allRules = result.validationResults.flatMap((r) => r.errors.map((e) => e.rule));
    expect(allRules.filter((r) => r === "visitName-unique")).toHaveLength(2);
  });

  it("produces one ValidationResult per entry", () => {
    const index = idx({
      subjectTypes: new Map([["Student", student]]),
      plainTypes: new Map([["Building", building]]),
    });
    expect(validateYaml(index).validationResults).toHaveLength(2);
  });
});
