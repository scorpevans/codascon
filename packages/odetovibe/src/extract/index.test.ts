/**
 * @codascon/odetovibe — Extract Domain Tests
 *
 * Covers:
 *   - parseYaml: entry parsing at parse time (SubjectTypeEntry vs PlainTypeEntry,
 *     AbstractTemplateEntry, qualified keys, namespace)
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
  StrategyEntry,
  MiddlewareCommandEntry,
  MiddlewareTemplateEntry,
  MiddlewareStrategyEntry,
  ValidateEntryCommand,
  ValidateCommandHooksCommand,
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

const student = new SubjectTypeEntry("Student", { resolverName: "resolveStudent" });
const professor = new SubjectTypeEntry("Professor", { resolverName: "resolveProfessor" });
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
  dispatch: { Student: "GrantAccessDefault" },
  templates: {
    GrantAccess: { isParameterized: false, strategies: { GrantAccessDefault: {} } },
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

  it("[resolverName-prefix] fails when resolverName does not start with 'resolve'", () => {
    const entry = new SubjectTypeEntry("Student", { resolverName: "visitStudent" });
    const index = idx({ subjectTypes: new Map([["Student", entry]]) });
    expect(rules(validateCmd.run(entry, index))).toContain("resolverName-prefix");
  });

  it("[resolverName-unique] fails when two subjects share the same resolverName", () => {
    const clash = new SubjectTypeEntry("Professor", { resolverName: "resolveStudent" });
    const index = idx({
      subjectTypes: new Map([
        ["Student", student],
        ["Professor", clash],
      ]),
    });
    expect(rules(validateCmd.run(student, index))).toContain("resolverName-unique");
  });

  it("[resolverName-unique] does not flag an entry against its own resolverName", () => {
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

  it("[subjectUnion-resolverName] fails when a subjectUnion entry is a plain type (no resolverName)", () => {
    const entry = makeCmd({ subjectUnion: ["Building"], dispatch: { Building: "GrantAccess" } });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain(
      "subjectUnion-resolverName",
    );
  });

  it("[dispatch-coverage] fails when a subjectUnion member has no dispatch entry and no defaultResolver", () => {
    const entry = makeCmd({
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "GrantAccess" }, // Professor missing, no defaultResolver
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-coverage");
  });

  it("[dispatch-coverage] passes when a subjectUnion member has no dispatch entry but defaultResolver is declared", () => {
    // Professor is absent from dispatch — valid because defaultResolver handles it at runtime.
    const entry = new CommandEntry("Cmd", {
      commandName: "accessBuilding",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "GrantAccessDefault" }, // Professor intentionally absent
      defaultResolver: "GrantAccessDefault",
      templates: {
        GrantAccess: { isParameterized: false, strategies: { GrantAccessDefault: {} } },
      },
    });
    expect(validateCmd.run(entry, indexWithCmd(entry)).valid).toBe(true);
  });

  it("[dispatch-extra] fails when a dispatch key is not in subjectUnion", () => {
    const entry = makeCmd({
      dispatch: { Student: "GrantAccess", Professor: "GrantAccess" }, // Professor not in union
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-extra");
  });

  it("[dispatch-coverage + dispatch-extra] both fire when dispatch has wrong subjects", () => {
    // Professor is in subjectUnion but missing from dispatch → dispatch-coverage
    // Ghost is in dispatch but not in subjectUnion → dispatch-extra
    const entry = makeCmd({
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "GrantAccess", Ghost: "GrantAccess" },
    });
    const result = validateCmd.run(entry, indexWithCmd(entry));
    expect(rules(result)).toContain("dispatch-coverage");
    expect(rules(result)).toContain("dispatch-extra");
  });

  it("[dispatch-target-ref] fails when a bare name is not a strategy in any template", () => {
    const entry = makeCmd({ dispatch: { Student: "NoSuchStrategy" }, templates: {} });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-target-ref");
  });

  it("[dispatch-target-ref] fails when a bare template name is used (templates are abstract, only strategy names are valid)", () => {
    const entry = makeCmd({
      dispatch: { Student: "AccessTemplate" }, // template name, not a strategy name
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-target-ref");
  });

  it("accepts a plain strategy name as a bare dispatch target", () => {
    const entry = makeCmd({
      dispatch: { Student: "DepartmentMatch" }, // plain strategy name, no dot notation
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    expect(validateCmd.run(entry, indexWithCmd(entry)).valid).toBe(true);
  });

  it("[dispatch-target-format] fails when dispatch value contains a dot (dot notation is not supported)", () => {
    const entry = makeCmd({
      dispatch: { Student: "AccessTemplate.DepartmentMatch" },
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-target-format");
  });

  it("[dispatch-target-format] fails when dispatch value has more than two dot-separated parts", () => {
    const entry = makeCmd({ dispatch: { Student: "A.B.C" }, templates: {} });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("dispatch-target-format");
  });

  it("[strategy-name-unique] fails when two templates declare the same strategy name", () => {
    const entry = makeCmd({
      dispatch: { Student: "Shared" },
      templates: {
        TemplateA: { isParameterized: false, strategies: { Shared: {} } },
        TemplateB: { isParameterized: false, strategies: { Shared: {} } },
      },
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("strategy-name-unique");
  });

  it("[commandName-file-unique] fails when two command keys normalize to the same file name", () => {
    // "AccessBuildingCommand" and "AccessBuilding" both normalize to "access-building.ts"
    const cmd1 = new CommandEntry("AccessBuildingCommand", validCmdConfig);
    const cmd2 = new CommandEntry("AccessBuilding", validCmdConfig);
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map([
        ["AccessBuildingCommand", cmd1],
        ["AccessBuilding", cmd2],
      ]),
    };
    expect(rules(validateCmd.run(cmd1, index))).toContain("commandName-file-unique");
    expect(rules(validateCmd.run(cmd2, index))).toContain("commandName-file-unique");
  });

  it("[commandName-file-unique] passes when command keys normalize to distinct file names", () => {
    const cmd1 = new CommandEntry("AccessBuildingCommand", validCmdConfig);
    const cmd2 = new CommandEntry("FeedCommand", validCmdConfig);
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map([
        ["AccessBuildingCommand", cmd1],
        ["FeedCommand", cmd2],
      ]),
    };
    expect(validateCmd.run(cmd1, index).valid).toBe(true);
  });

  it("reports multiple rule violations for a single entry", () => {
    // baseType and objectType are both unknown — both errors accumulate; no short-circuit
    const entry = makeCmd({ baseType: "Unknown", objectType: "AlsoUnknown" });
    const result = validateCmd.run(entry, indexWithCmd(entry));
    expect(result.valid).toBe(false);
    expect(rules(result)).toContain("baseType-ref");
    expect(rules(result)).toContain("objectType-ref");
    expect(rules(result)).toHaveLength(2);
  });

  it("[dispatch-target-ref] config.templates absent — ?? {} fallback (line 179)", () => {
    // When a YAML command has no templates key, config.templates is undefined at runtime.
    // The validator coalesces to {} at line 179 so every dispatch target is "not found".
    const entry = new CommandEntry("Cmd", {
      commandName: "cmd",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "AnyTemplate" },
    } as any); // templates intentionally absent to trigger the ?? {} path
    expect(rules(validateCmd.run(entry, withTypes))).toContain("dispatch-target-ref");
  });

  // Rule 12: defaultResolver-ref and defaultResolver-coverage
  it("passes when defaultResolver references a strategy with no subjectSubset (covers full union)", () => {
    const entry = makeCmd({ defaultResolver: "GrantAccessDefault" });
    expect(validateCmd.run(entry, indexWithCmd(entry)).valid).toBe(true);
  });

  it("[defaultResolver-ref] fails when defaultResolver names a strategy not found in templates", () => {
    const entry = makeCmd({ defaultResolver: "NoSuchStrategy" });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain("defaultResolver-ref");
  });

  it("[defaultResolver-coverage] fails when defaultResolver strategy subjectSubset misses a subject", () => {
    // Command dispatches both Student and Professor; defaultResolver strategy only covers Student
    const entry = new CommandEntry("Cmd", {
      commandName: "accessBuilding",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "StudentOnly", Professor: "ProfOnly" },
      templates: {
        AccessTemplate: {
          isParameterized: true,
          strategies: {
            StudentOnly: { subjectSubset: ["Student"] },
            ProfOnly: { subjectSubset: ["Professor"] },
          },
        },
      },
      defaultResolver: "StudentOnly", // subjectSubset: [Student] — misses Professor
    });
    expect(rules(validateCmd.run(entry, indexWithCmd(entry)))).toContain(
      "defaultResolver-coverage",
    );
  });

  it("passes when defaultResolver strategy subjectSubset covers all subjects", () => {
    // CatchAll strategy explicitly declares both subjects in its subjectSubset
    const entry = new CommandEntry("Cmd", {
      commandName: "accessBuilding",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student", "Professor"],
      dispatch: { Student: "StudentOnly", Professor: "CatchAll" },
      templates: {
        AccessTemplate: {
          isParameterized: true,
          strategies: {
            StudentOnly: { subjectSubset: ["Student"] },
            CatchAll: { subjectSubset: ["Student", "Professor"] }, // covers both
          },
        },
      },
      defaultResolver: "CatchAll",
    });
    expect(validateCmd.run(entry, indexWithCmd(entry)).valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// AbstractTemplateValidator
// ═══════════════════════════════════════════════════════════════════

describe("AbstractTemplateValidator", () => {
  const cmdEntry = new CommandEntry("Cmd", {
    commandName: "cmd",
    baseType: "Person",
    objectType: "Building",
    returnType: "AccessResult",
    subjectUnion: ["Student"],
    dispatch: { Student: "DepartmentMatch" },
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

  it("[subjectSubset-parent] uses cmdEntry.subjectUnion when parent template has no subjectSubset (line 424 first ?? path)", () => {
    // tpl.config.subjectSubset is undefined → falls through to cmdEntry?.config.subjectUnion.
    // "Professor" is in cmdEntry.subjectUnion ["Student", "Professor"] → no error.
    const tplWithoutSubset = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: true,
      strategies: { DepartmentMatch: {} },
      // no subjectSubset — forces the ?? fallback to cmdEntry.subjectUnion
    });
    const entry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
      subjectSubset: ["Professor"],
    });
    const index: ConfigIndex = {
      ...baseIndex(),
      abstractTemplates: new Map([["Cmd.AccessTemplate", tplWithoutSubset]]),
    };
    expect(validateCmd.run(entry, index).valid).toBe(true);
  });

  it("[subjectSubset-parent] uses [] when both parent subjectSubset and cmdEntry are absent (line 424 second ?? path)", () => {
    // tpl.config.subjectSubset is undefined AND command is not in the index (cmdEntry undefined).
    // Both ?? operands are nullish → parentSubset falls back to [].
    // Any strategy subjectSubset entry will then fail the parentSet.has() check.
    const tplWithoutSubset = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: true,
      strategies: { DepartmentMatch: {} },
      // no subjectSubset
    });
    const entry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
      subjectSubset: ["Student"],
    });
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map(), // "Cmd" absent → cmdEntry undefined → ?? [] fallback
      abstractTemplates: new Map([["Cmd.AccessTemplate", tplWithoutSubset]]),
    };
    expect(rules(validateCmd.run(entry, index))).toContain("subjectSubset-parent");
  });

  it("[commandHook-key] parent template without commandHooks — ?? {} path (line 441)", () => {
    // tpl.config.commandHooks is undefined → Object.keys(undefined ?? {}) = [] → empty parentHookKeys.
    // Any hookKey in strategy.commandHooks then fails the parentHookKeys.has() check.
    const tplWithoutHooks = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: true,
      strategies: { DepartmentMatch: {} },
      // no commandHooks — forces the ?? {} fallback at line 441
    });
    const entry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {
      commandHooks: { audit: "AuditCmd" }, // "audit" not declared by parent → commandHook-key
    });
    const index: ConfigIndex = {
      ...baseIndex(),
      abstractTemplates: new Map([["Cmd.AccessTemplate", tplWithoutHooks]]),
    };
    expect(rules(validateCmd.run(entry, index))).toContain("commandHook-key");
  });
});

// ═══════════════════════════════════════════════════════════════════
// parseYaml — entry splitting at parse time
// ═══════════════════════════════════════════════════════════════════

describe("parseYaml", () => {
  it("places domain types with resolverName into subjectTypes", () => {
    const index = parseYamlString(`
domainTypes:
  Student:
    resolverName: resolveStudent
commands: {}
`);
    expect(index.subjectTypes.has("Student")).toBe(true);
    expect(index.plainTypes.has("Student")).toBe(false);
    expect(index.subjectTypes.get("Student")?.config.resolverName).toBe("resolveStudent");
  });

  it("places domain types without resolverName into plainTypes", () => {
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
    resolverName: resolveSubj
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
  });

  it("places templates with empty strategies into abstractTemplates", () => {
    const index = parseYamlString(`
domainTypes:
  Base: {}
  Obj: {}
  Ret: {}
  Subj:
    resolverName: resolveSubj
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
    expect(index.abstractTemplates.has("MyCmd.GrantAccess")).toBe(true);
  });

  it("keys strategies as CommandName.TemplateName.StrategyName", () => {
    const index = parseYamlString(`
domainTypes:
  Base: {}
  Obj: {}
  Ret: {}
  Subj:
    resolverName: resolveSubj
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
    //       resolverName: resolveSubjectType
    const index = parseYamlString(`
domainTypes:
  ConfigEntry:
  SubjectType:
    resolverName: resolveSubjectType
commands: {}
`);
    expect(index.plainTypes.has("ConfigEntry")).toBe(true);
    expect(index.subjectTypes.has("SubjectType")).toBe(true);
  });

  it("captures typeImports when present", () => {
    const index = parseYamlString(`
typeImports:
  "ts-morph":
    - Project
    - SourceFile
  "../schema.js":
    - DomainType
domainTypes: {}
commands: {}
`);
    expect(index.typeImports).toEqual({
      "ts-morph": ["Project", "SourceFile"],
      "../schema.js": ["DomainType"],
    });
  });

  it("defaults typeImports to empty object when absent", () => {
    const index = parseYamlString(`
domainTypes: {}
commands: {}
`);
    expect(index.typeImports).toEqual({});
  });

  it("throws for a non-existent file (ENOENT)", () => {
    expect(() => parseYaml("/nonexistent/path/that/does/not/exist.yaml")).toThrow();
  });

  it("throws for malformed YAML", () => {
    expect(() => parseYamlString("key: [unclosed")).toThrow();
  });

  it("throws for an empty YAML file (yaml.load returns null/undefined)", () => {
    expect(() => parseYamlString("")).toThrow();
  });

  it("handles absent domainTypes key — domainTypes ?? {} path (index.ts line 109)", () => {
    // When the YAML has no domainTypes key, parsed.domainTypes is undefined.
    // The ?? {} fallback makes Object.entries return [], so the loop is a no-op.
    const index = parseYamlString(`commands: {}`);
    expect(index.subjectTypes.size).toBe(0);
    expect(index.plainTypes.size).toBe(0);
    expect(index.commands.size).toBe(0);
  });

  it("handles absent commands key — commands ?? {} path (index.ts line 123)", () => {
    // When the YAML has no commands key, parsed.commands is undefined.
    // The ?? {} fallback makes Object.entries return [], so the loop is a no-op.
    const index = parseYamlString(`domainTypes:\n  Person: {}`);
    expect(index.commands.size).toBe(0);
    expect(index.plainTypes.has("Person")).toBe(true);
  });

  it("handles command without templates key — templates ?? {} path (index.ts line 126)", () => {
    // When a command config has no templates key, cmdConfig.templates is undefined.
    // The ?? {} fallback makes Object.entries return [], so the inner loop is a no-op.
    const index = parseYamlString(`
domainTypes:
  Person: {}
  Item: {}
  Result: {}
  Student:
    resolverName: resolveStudent
commands:
  Cmd:
    commandName: cmd
    baseType: Person
    objectType: Item
    returnType: Result
    subjectUnion: [Student]
    dispatch:
      Student: GrantAccess
`);
    expect(index.commands.has("Cmd")).toBe(true);
    expect(index.abstractTemplates.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// validateYaml — end-to-end
// ═══════════════════════════════════════════════════════════════════

describe("validateYaml", () => {
  it("returns valid:true for a fully valid ConfigIndex", () => {
    const cmdEntry = new CommandEntry("Cmd", validCmdConfig);
    const tplEntry = new AbstractTemplateEntry("GrantAccess", "Cmd", {
      isParameterized: false,
      strategies: { GrantAccessDefault: {} },
    });
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map([["Cmd", cmdEntry]]),
      abstractTemplates: new Map([["Cmd.GrantAccess", tplEntry]]),
    };
    const result = validateYaml(index);
    expect(result.valid).toBe(true);
    expect(result.configIndex).toBe(index);
  });

  it("returns valid:false when any entry fails", () => {
    const s1 = new SubjectTypeEntry("Student", { resolverName: "resolvePerson" });
    const s2 = new SubjectTypeEntry("Professor", { resolverName: "resolvePerson" });
    const index = idx({
      subjectTypes: new Map([
        ["Student", s1],
        ["Professor", s2],
      ]),
    });
    expect(validateYaml(index).valid).toBe(false);
  });

  it("collects errors from all failing entries", () => {
    // Both subjects share a resolverName — both report resolverName-unique
    const s1 = new SubjectTypeEntry("Student", { resolverName: "resolvePerson" });
    const s2 = new SubjectTypeEntry("Professor", { resolverName: "resolvePerson" });
    const index = idx({
      subjectTypes: new Map([
        ["Student", s1],
        ["Professor", s2],
      ]),
    });
    const result = validateYaml(index);
    const allRules = result.validationResults.flatMap((r) => r.errors.map((e) => e.rule));
    expect(allRules.filter((r) => r === "resolverName-unique")).toHaveLength(2);
  });

  it("produces one ValidationResult per entry", () => {
    const index = idx({
      subjectTypes: new Map([["Student", student]]),
      plainTypes: new Map([["Building", building]]),
    });
    expect(validateYaml(index).validationResults).toHaveLength(2);
  });

  it("validates entries in abstractTemplates and strategies maps", () => {
    // Exercises the two previously uncovered loops in validateYaml (lines 190, 196).
    const cmdEntry = new CommandEntry("Cmd", {
      commandName: "cmd",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "DepartmentMatch" },
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    const tplEntry = new AbstractTemplateEntry("AccessTemplate", "Cmd", {
      isParameterized: true,
      strategies: { DepartmentMatch: {} },
    });
    const stratEntry = new StrategyEntry("DepartmentMatch", "AccessTemplate", "Cmd", {});
    const index: ConfigIndex = {
      ...withTypes,
      commands: new Map([["Cmd", cmdEntry]]),
      abstractTemplates: new Map([["Cmd.AccessTemplate", tplEntry]]),
      strategies: new Map([["Cmd.AccessTemplate.DepartmentMatch", stratEntry]]),
    };
    const result = validateYaml(index);
    expect(result.valid).toBe(true);
    // subjectTypes(2) + plainTypes(3) + commands(1) + abstractTemplates(1) + strategies(1) = 8
    expect(result.validationResults).toHaveLength(8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// parseYaml — middleware section
// ═══════════════════════════════════════════════════════════════════

describe("parseYaml — middleware section", () => {
  const middlewareYaml = `
domainTypes:
  Base: {}
  Ctx: {}
  Res: {}
  Rock:
    resolverName: resolveRock
  Gem:
    resolverName: resolveGem
commands:
  MineCommand:
    commandName: mine
    baseType: Base
    objectType: Ctx
    returnType: Res
    dispatch:
      Rock: RockMinerDefault
      Gem: GemMinerDefault
    templates:
      RockMiner:
        isParameterized: false
        strategies:
          RockMinerDefault: {}
      GemMiner:
        isParameterized: false
        strategies:
          GemMinerDefault: {}
middleware:
  TraceMiddleware:
    commandName: trace
    baseType: Base
    objectType: Ctx
    returnType: Res
    dispatch:
      Rock: TraceRockDefault
      Gem: TraceGemDefault
    templates:
      TraceRock:
        isParameterized: false
        strategies:
          TraceRockDefault: {}
      TraceGem:
        isParameterized: false
        strategies:
          TraceGemDefault: {}
`;

  it("populates middlewareCommands with each middleware key", () => {
    const index = parseYamlString(middlewareYaml);
    expect(index.middlewareCommands.has("TraceMiddleware")).toBe(true);
  });

  it("populates middlewareTemplates with qualified keys (MiddlewareName.TemplateName)", () => {
    const index = parseYamlString(middlewareYaml);
    expect(index.middlewareTemplates.has("TraceMiddleware.TraceRock")).toBe(true);
    expect(index.middlewareTemplates.has("TraceMiddleware.TraceGem")).toBe(true);
  });

  it("populates middlewareStrategies with qualified keys (MiddlewareName.TemplateName.StrategyName)", () => {
    const index = parseYamlString(middlewareYaml);
    expect(index.middlewareStrategies.has("TraceMiddleware.TraceRock.TraceRockDefault")).toBe(true);
    expect(index.middlewareStrategies.has("TraceMiddleware.TraceGem.TraceGemDefault")).toBe(true);
  });

  it("MiddlewareCommandEntry carries the correct key and config", () => {
    const index = parseYamlString(middlewareYaml);
    const entry = index.middlewareCommands.get("TraceMiddleware");
    expect(entry).toBeInstanceOf(MiddlewareCommandEntry);
    expect(entry?.config.commandName).toBe("trace");
  });

  it("MiddlewareTemplateEntry carries commandKey pointing to parent middleware", () => {
    const index = parseYamlString(middlewareYaml);
    const entry = index.middlewareTemplates.get("TraceMiddleware.TraceRock");
    expect(entry).toBeInstanceOf(MiddlewareTemplateEntry);
    expect(entry?.commandKey).toBe("TraceMiddleware");
  });

  it("MiddlewareStrategyEntry carries templateKey and commandKey", () => {
    const index = parseYamlString(middlewareYaml);
    const entry = index.middlewareStrategies.get("TraceMiddleware.TraceRock.TraceRockDefault");
    expect(entry).toBeInstanceOf(MiddlewareStrategyEntry);
    expect(entry?.templateKey).toBe("TraceRock");
    expect(entry?.commandKey).toBe("TraceMiddleware");
  });

  it("leaves middlewareCommands/Templates/Strategies empty when no middleware section", () => {
    const index = parseYamlString(`domainTypes: {}\ncommands: {}\n`);
    expect(index.middlewareCommands.size).toBe(0);
    expect(index.middlewareTemplates.size).toBe(0);
    expect(index.middlewareStrategies.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MiddlewareCommandValidator
// ═══════════════════════════════════════════════════════════════════

describe("MiddlewareCommandValidator", () => {
  const rock = new SubjectTypeEntry("Rock", { resolverName: "resolveRock" });
  const gem = new SubjectTypeEntry("Gem", { resolverName: "resolveGem" });
  const ctx = new PlainTypeEntry("Ctx", {});
  const res = new PlainTypeEntry("Res", {});

  const validMwConfig = {
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
  };

  function mwIdx(mw: MiddlewareCommandEntry) {
    return idx({
      subjectTypes: new Map([
        ["Rock", rock],
        ["Gem", gem],
      ]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      middlewareCommands: new Map([["TraceMiddleware", mw]]),
    });
  }

  it("passes for a valid middleware command", () => {
    const entry = new MiddlewareCommandEntry("TraceMiddleware", validMwConfig);
    expect(validateCmd.run(entry, mwIdx(entry)).valid).toBe(true);
  });

  it("[dispatch-coverage] fails when a subject has no dispatch entry and no defaultResolver", () => {
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      ...validMwConfig,
      dispatch: { Rock: "TraceRockDefault" }, // Gem missing, no defaultResolver
    });
    expect(rules(validateCmd.run(entry, mwIdx(entry)))).toContain("dispatch-coverage");
  });

  it("[dispatch-coverage] passes when a subject has no dispatch entry but defaultResolver is declared", () => {
    // Gem is absent from dispatch — valid because defaultResolver handles it at runtime.
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      ...validMwConfig,
      dispatch: { Rock: "TraceRockDefault" }, // Gem intentionally absent
      defaultResolver: "TraceRockDefault",
    });
    expect(validateCmd.run(entry, mwIdx(entry)).valid).toBe(true);
  });

  it("[baseType-ref] fails when baseType is not a known domain type", () => {
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      ...validMwConfig,
      baseType: "Unknown",
    });
    expect(rules(validateCmd.run(entry, mwIdx(entry)))).toContain("baseType-ref");
  });

  it("[dispatch-target-ref] fails when dispatch names a strategy not found in templates", () => {
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      ...validMwConfig,
      dispatch: { Rock: "NoSuchStrategy", Gem: "TraceGemDefault" },
    });
    expect(rules(validateCmd.run(entry, mwIdx(entry)))).toContain("dispatch-target-ref");
  });

  // Rule 10: middleware-ref
  it("[middleware-ref] fails when Command.middleware[] references a key not in middlewareCommands", () => {
    const cmdEntry = new CommandEntry("MineCommand", {
      commandName: "mine",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock", "Gem"],
      dispatch: { Rock: "RockMinerDefault", Gem: "GemMinerDefault" },
      templates: {
        RockMiner: { isParameterized: false, strategies: { RockMinerDefault: {} } },
        GemMiner: { isParameterized: false, strategies: { GemMinerDefault: {} } },
      },
      middleware: ["NonExistentMiddleware"],
    });
    const index = idx({
      subjectTypes: new Map([
        ["Rock", rock],
        ["Gem", gem],
      ]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      commands: new Map([["MineCommand", cmdEntry]]),
      middlewareCommands: new Map(), // NonExistentMiddleware absent
    });
    expect(rules(validateCmd.run(cmdEntry, index))).toContain("middleware-ref");
  });

  // Rule 11: middleware-coverage
  it("[middleware-coverage] fails when middleware dispatch keys don't cover all command subjects", () => {
    // TraceMiddleware only covers Rock, not Gem — but MineCommand needs both
    const rockOnlyMw = new MiddlewareCommandEntry("TraceMiddleware", {
      commandName: "trace",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock"],
      dispatch: { Rock: "TraceRockDefault" }, // Gem missing
      templates: {
        TraceRock: { isParameterized: false, strategies: { TraceRockDefault: {} } },
      },
    });
    const cmdEntry = new CommandEntry("MineCommand", {
      commandName: "mine",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock", "Gem"],
      dispatch: { Rock: "RockMinerDefault", Gem: "GemMinerDefault" },
      templates: {
        RockMiner: { isParameterized: false, strategies: { RockMinerDefault: {} } },
        GemMiner: { isParameterized: false, strategies: { GemMinerDefault: {} } },
      },
      middleware: ["TraceMiddleware"],
    });
    const index = idx({
      subjectTypes: new Map([
        ["Rock", rock],
        ["Gem", gem],
      ]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      commands: new Map([["MineCommand", cmdEntry]]),
      middlewareCommands: new Map([["TraceMiddleware", rockOnlyMw]]),
    });
    expect(rules(validateCmd.run(cmdEntry, index))).toContain("middleware-coverage");
  });

  it("passes rule 11 when middleware covers all command subjects (superset)", () => {
    // TraceMiddleware covers Rock + Gem + an extra subject — superset is fine
    const wideTraceMw = new MiddlewareCommandEntry("TraceMiddleware", validMwConfig);
    const cmdEntry = new CommandEntry("MineCommand", {
      commandName: "mine",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock"],
      dispatch: { Rock: "RockMinerDefault" }, // only Rock
      templates: {
        RockMiner: { isParameterized: false, strategies: { RockMinerDefault: {} } },
      },
      middleware: ["TraceMiddleware"],
    });
    const index = idx({
      subjectTypes: new Map([
        ["Rock", rock],
        ["Gem", gem],
      ]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      commands: new Map([["MineCommand", cmdEntry]]),
      middlewareCommands: new Map([["TraceMiddleware", wideTraceMw]]),
    });
    expect(validateCmd.run(cmdEntry, index).valid).toBe(true);
  });

  // Rule 12: defaultResolver-ref and defaultResolver-coverage on MiddlewareCommand
  it("passes when middleware defaultResolver references a strategy with no subjectSubset (covers full union)", () => {
    // Strategy has no subjectSubset; parent template has no subjectSubset →
    // effectiveStratSubset = full subject union = [Rock] → covers the only subject → passes
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      commandName: "trace",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock"],
      dispatch: { Rock: "TraceRockDefault" },
      templates: {
        TraceRock: { isParameterized: false, strategies: { TraceRockDefault: {} } },
      },
      defaultResolver: "TraceRockDefault",
    });
    expect(validateCmd.run(entry, mwIdx(entry)).valid).toBe(true);
  });

  it("[defaultResolver-ref] fails when middleware defaultResolver names a strategy not found in templates", () => {
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      ...validMwConfig,
      defaultResolver: "NoSuchStrategy",
    });
    expect(rules(validateCmd.run(entry, mwIdx(entry)))).toContain("defaultResolver-ref");
  });

  it("[defaultResolver-coverage] fails when middleware defaultResolver strategy subjectSubset misses a subject", () => {
    // Middleware dispatches both Rock and Gem; defaultResolver strategy only covers Rock
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      commandName: "trace",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock", "Gem"],
      dispatch: { Rock: "RockOnly", Gem: "GemOnly" },
      templates: {
        TraceTemplate: {
          isParameterized: true,
          strategies: {
            RockOnly: { subjectSubset: ["Rock"] },
            GemOnly: { subjectSubset: ["Gem"] },
          },
        },
      },
      defaultResolver: "RockOnly", // subjectSubset: [Rock] — misses Gem
    });
    expect(rules(validateCmd.run(entry, mwIdx(entry)))).toContain("defaultResolver-coverage");
  });

  it("passes when middleware defaultResolver strategy subjectSubset covers all subjects", () => {
    const entry = new MiddlewareCommandEntry("TraceMiddleware", {
      commandName: "trace",
      baseType: "Ctx",
      objectType: "Ctx",
      returnType: "Res",
      subjectUnion: ["Rock", "Gem"],
      dispatch: { Rock: "RockOnly", Gem: "CatchAll" },
      templates: {
        TraceTemplate: {
          isParameterized: true,
          strategies: {
            RockOnly: { subjectSubset: ["Rock"] },
            CatchAll: { subjectSubset: ["Rock", "Gem"] },
          },
        },
      },
      defaultResolver: "CatchAll",
    });
    expect(validateCmd.run(entry, mwIdx(entry)).valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MiddlewareTemplateValidator
// ═══════════════════════════════════════════════════════════════════

describe("MiddlewareTemplateValidator", () => {
  const rock = new SubjectTypeEntry("Rock", { resolverName: "resolveRock" });
  const ctx = new PlainTypeEntry("Ctx", {});
  const res = new PlainTypeEntry("Res", {});

  const mwEntry = new MiddlewareCommandEntry("TraceMiddleware", {
    commandName: "trace",
    baseType: "Ctx",
    objectType: "Ctx",
    returnType: "Res",
    subjectUnion: ["Rock"],
    dispatch: { Rock: "TraceRockDefault" },
    templates: {
      TraceRock: { isParameterized: false, strategies: { TraceRockDefault: {} } },
    },
  });

  function baseIdx(): ConfigIndex {
    return idx({
      subjectTypes: new Map([["Rock", rock]]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      middlewareCommands: new Map([["TraceMiddleware", mwEntry]]),
    });
  }

  it("passes for a valid middleware template", () => {
    const tpl = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
      isParameterized: false,
      strategies: { TraceRockDefault: {} },
    });
    expect(validateCmd.run(tpl, baseIdx()).valid).toBe(true);
  });

  it("[parent-command] fails when parent middleware command is not in middlewareCommands", () => {
    const tpl = new MiddlewareTemplateEntry("TraceRock", "NoSuchMiddleware", {
      isParameterized: false,
      strategies: {},
    });
    expect(rules(validateCmd.run(tpl, baseIdx()))).toContain("parent-command");
  });

  it("[subjectSubset] fails when subjectSubset references a subject outside parent's union", () => {
    const gem = new SubjectTypeEntry("Gem", { resolverName: "resolveGem" });
    const tpl = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
      isParameterized: true,
      subjectSubset: ["Gem"], // Gem is not in TraceMiddleware's dispatch
      strategies: {},
    });
    const index = idx({
      subjectTypes: new Map([
        ["Rock", rock],
        ["Gem", gem],
      ]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      middlewareCommands: new Map([["TraceMiddleware", mwEntry]]),
    });
    expect(rules(validateCmd.run(tpl, index))).toContain("subjectSubset");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MiddlewareStrategyValidator
// ═══════════════════════════════════════════════════════════════════

describe("MiddlewareStrategyValidator", () => {
  const rock = new SubjectTypeEntry("Rock", { resolverName: "resolveRock" });
  const ctx = new PlainTypeEntry("Ctx", {});
  const res = new PlainTypeEntry("Res", {});

  const mwEntry = new MiddlewareCommandEntry("TraceMiddleware", {
    commandName: "trace",
    baseType: "Ctx",
    objectType: "Ctx",
    returnType: "Res",
    subjectUnion: ["Rock"],
    dispatch: { Rock: "TraceRockDefault" },
    templates: {
      TraceRock: { isParameterized: false, strategies: { TraceRockDefault: {} } },
    },
  });

  const tplEntry = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
    isParameterized: false,
    strategies: { TraceRockDefault: {} },
  });

  function baseIdx(): ConfigIndex {
    return idx({
      subjectTypes: new Map([["Rock", rock]]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      middlewareCommands: new Map([["TraceMiddleware", mwEntry]]),
      middlewareTemplates: new Map([["TraceMiddleware.TraceRock", tplEntry]]),
    });
  }

  it("passes for a valid middleware strategy", () => {
    const strat = new MiddlewareStrategyEntry(
      "TraceRockDefault",
      "TraceRock",
      "TraceMiddleware",
      {},
    );
    expect(validateCmd.run(strat, baseIdx()).valid).toBe(true);
  });

  it("[parent-template] fails when parent template is not in middlewareTemplates", () => {
    const strat = new MiddlewareStrategyEntry(
      "TraceRockDefault",
      "NoSuchTemplate",
      "TraceMiddleware",
      {},
    );
    expect(rules(validateCmd.run(strat, baseIdx()))).toContain("parent-template");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCommandHooksCommand — middleware routing
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCommandHooksCommand — MiddlewareTemplateEntry and MiddlewareStrategyEntry routing", () => {
  const hooksCmd = new ValidateCommandHooksCommand();

  const rock = new SubjectTypeEntry("Rock", { resolverName: "resolveRock" });
  const ctx = new PlainTypeEntry("Ctx", {});
  const res = new PlainTypeEntry("Res", {});

  const auditMwEntry = new MiddlewareCommandEntry("AuditMiddleware", {
    commandName: "audit",
    baseType: "Ctx",
    objectType: "Ctx",
    returnType: "Res",
    subjectUnion: ["Rock"],
    dispatch: { Rock: "AuditRockDefault" },
    templates: { AuditRock: { isParameterized: false, strategies: { AuditRockDefault: {} } } },
  });

  function baseIdx(): ConfigIndex {
    return idx({
      subjectTypes: new Map([["Rock", rock]]),
      plainTypes: new Map([
        ["Ctx", ctx],
        ["Res", res],
      ]),
      middlewareCommands: new Map([["AuditMiddleware", auditMwEntry]]),
    });
  }

  it("passes when MiddlewareTemplateEntry commandHooks references a known middlewareCommand", () => {
    const tpl = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
      isParameterized: false,
      commandHooks: { audit: "AuditMiddleware" },
      strategies: {},
    });
    expect(hooksCmd.run(tpl, baseIdx()).valid).toBe(true);
  });

  it("[commandHook-ref] fires for MiddlewareTemplateEntry when commandHooks references unknown command", () => {
    const tpl = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
      isParameterized: false,
      commandHooks: { audit: "NonExistentMiddleware" },
      strategies: {},
    });
    expect(rules(hooksCmd.run(tpl, baseIdx()))).toContain("commandHook-ref");
  });

  it("passes when MiddlewareStrategyEntry commandHooks is a subset of parent template's keys", () => {
    const tplEntry = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
      isParameterized: false,
      commandHooks: { audit: "AuditMiddleware" },
      strategies: {},
    });
    const strat = new MiddlewareStrategyEntry("TraceRockDefault", "TraceRock", "TraceMiddleware", {
      commandHooks: { audit: "AuditMiddleware" },
    });
    const index = idx({
      ...baseIdx(),
      middlewareTemplates: new Map([["TraceMiddleware.TraceRock", tplEntry]]),
    });
    expect(hooksCmd.run(strat, index).valid).toBe(true);
  });

  it("[commandHook-key] fires for MiddlewareStrategyEntry when hook key not in parent template", () => {
    const tplEntry = new MiddlewareTemplateEntry("TraceRock", "TraceMiddleware", {
      isParameterized: false,
      commandHooks: {}, // no hooks declared
      strategies: {},
    });
    const strat = new MiddlewareStrategyEntry("TraceRockDefault", "TraceRock", "TraceMiddleware", {
      commandHooks: { audit: "AuditMiddleware" }, // "audit" not in parent
    });
    const index = idx({
      ...baseIdx(),
      middlewareTemplates: new Map([["TraceMiddleware.TraceRock", tplEntry]]),
    });
    expect(rules(hooksCmd.run(strat, index))).toContain("commandHook-key");
  });
});
