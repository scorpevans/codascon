/**
 * @codascon/odetovibe — CLI Tests
 *
 * Covers:
 *   - printUsage: correct positional argument name, description, and flags
 *   - main: exit codes and output for --help, -h, missing argument,
 *     file not found, invalid YAML, and the happy path
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./extract/index.js");
vi.mock("./transform/index.js");
vi.mock("./load/index.js");

import { printUsage, main } from "./cli.js";
import { parseYaml, validateYaml } from "./extract/index.js";
import { writeFiles } from "./load/index.js";
import type { ConfigIndex, ExtractResult } from "./extract/domain-types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const fakeConfigIndex: ConfigIndex = {
  namespace: "test",
  imports: {},
  externalTypeKeys: new Set(),
  subjectTypes: new Map(),
  plainTypes: new Map(),
  commands: new Map([["TestCommand", null as never]]),
  abstractTemplates: new Map(),
  concreteTemplates: new Map(),
  strategies: new Map(),
};

const fakeValidResult: ExtractResult = {
  valid: true,
  configIndex: fakeConfigIndex,
  validationResults: [],
};

// ── printUsage ────────────────────────────────────────────────────────────────

describe("printUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function capture(): { lines: string[]; output: string } {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => lines.push(String(args[0])));
    printUsage();
    return { lines, output: lines.join("\n") };
  }

  it("uses code_config.yaml as the positional argument name", () => {
    const { output } = capture();
    expect(output).toContain("<code_config.yaml>");
  });

  it("describes the positional argument as the code's YAML-config file", () => {
    const { output } = capture();
    expect(output).toContain("Path to the code's YAML-config file");
  });

  it("lists the --out flag in usage", () => {
    const { output } = capture();
    expect(output).toContain("--out");
  });

  it("lists the --overwrite flag in usage", () => {
    const { output } = capture();
    expect(output).toContain("--overwrite");
  });

  it("lists the --no-overwrite flag in usage", () => {
    const { output } = capture();
    expect(output).toContain("--no-overwrite");
  });
});

// ── main ──────────────────────────────────────────────────────────────────────

describe("main", () => {
  let origArgv: string[];
  let exitCodes: number[];
  let logLines: string[];
  let errorLines: string[];

  beforeEach(() => {
    origArgv = process.argv;
    exitCodes = [];
    logLines = [];
    errorLines = [];
    vi.spyOn(process, "exit").mockImplementation((code?: number | string | null): never => {
      const n = typeof code === "number" ? code : 0;
      exitCodes.push(n);
      throw new ExitError(n);
    });
    vi.spyOn(console, "log").mockImplementation((...args) => logLines.push(String(args[0])));
    vi.spyOn(console, "error").mockImplementation((...args) => errorLines.push(String(args[0])));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Default happy-path mocks — override per test as needed
    vi.mocked(parseYaml).mockReturnValue(fakeConfigIndex);
    vi.mocked(validateYaml).mockReturnValue(fakeValidResult);
    vi.mocked(writeFiles).mockResolvedValue([]);
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.restoreAllMocks();
  });

  it("exits 0 and prints usage for --help", async () => {
    process.argv = ["node", "cli.js", "--help"];
    const err = await main().catch((e) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(logLines.join("\n")).toContain("<code_config.yaml>");
  });

  it("exits 0 and prints usage for -h", async () => {
    process.argv = ["node", "cli.js", "-h"];
    const err = await main().catch((e) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(logLines.join("\n")).toContain("<code_config.yaml>");
  });

  it("exits 1 and prints usage when no argument is provided", async () => {
    process.argv = ["node", "cli.js"];
    const err = await main().catch((e) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(logLines.join("\n")).toContain("<code_config.yaml>");
  });

  it("exits 1 and prints an error message when the schema file is not found", async () => {
    process.argv = ["node", "cli.js", "/nonexistent/config.yaml"];
    vi.mocked(parseYaml).mockImplementation(() => {
      throw Object.assign(
        new Error("ENOENT: no such file or directory, open '/nonexistent/config.yaml'"),
        {
          code: "ENOENT",
        },
      );
    });
    const err = await main().catch((e) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(errorLines.join("\n")).toContain("ENOENT");
  });

  it("exits 1 and prints validation errors for an invalid schema", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    vi.mocked(validateYaml).mockReturnValue({
      valid: false,
      configIndex: fakeConfigIndex,
      validationResults: [
        {
          valid: false,
          errors: [
            {
              entryKey: "GreetCommand",
              rule: "baseType-ref",
              message: 'baseType "Foo" does not reference a known domainType',
            },
          ],
        },
      ],
    });
    const err = await main().catch((e) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(errorLines.join("\n")).toContain("[baseType-ref]");
    expect(errorLines.join("\n")).toContain("GreetCommand");
  });
});
