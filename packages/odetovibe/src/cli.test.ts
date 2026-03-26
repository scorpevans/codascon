/**
 * @codascon/odetovibe — CLI Tests
 *
 * Covers:
 *   - printUsage: correct positional argument name, description, and flags
 *   - main: exit codes and output for --help, -h, missing argument,
 *     file not found, invalid YAML, and the happy path
 */

import { resolve } from "node:path";
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
  typeImports: {},
  subjectTypes: new Map(),
  plainTypes: new Map(),
  commands: new Map([["TestCommand", null as never]]),
  abstractTemplates: new Map(),
  strategies: new Map(),
  middlewareCommands: new Map(),
  middlewareTemplates: new Map(),
  middlewareStrategies: new Map(),
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

  it("lists the --outDir flag in usage", () => {
    const { output } = capture();
    expect(output).toContain("--outDir");
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

  it("exits 0 and reports created/updated files on a valid schema", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    vi.mocked(writeFiles).mockResolvedValue([
      { path: "/out/domain-types.ts", created: true },
      { path: "/out/commands/greet.ts", created: false },
    ]);
    await main(); // must not throw — no process.exit on success
    expect(exitCodes).toEqual([]); // exit 0 is implicit: process.exit never called
    expect(logLines.join("\n")).toContain("created /out/domain-types.ts");
    expect(logLines.join("\n")).toContain("updated /out/commands/greet.ts");
  });

  it("passes --overwrite mode to writeFiles", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml", "--overwrite"];
    await main();
    expect(vi.mocked(writeFiles)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "overwrite" }),
    );
  });

  it("passes --no-overwrite (strict) mode to writeFiles", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml", "--no-overwrite"];
    await main();
    expect(vi.mocked(writeFiles)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "strict" }),
    );
  });

  it("passes custom --outDir to writeFiles", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml", "--outDir", "/custom/out"];
    await main();
    expect(vi.mocked(writeFiles)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetDir: "/custom/out" }),
    );
  });

  it("exits 1 and logs compile errors when writeFiles reports them", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    vi.mocked(writeFiles).mockResolvedValue([
      { path: "/out/f.ts", created: false, compileErrors: ["TS2304: Cannot find name 'X'"] },
    ]);
    const err = await main().catch((e) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(errorLines.join("\n")).toContain("compile errors in /out/f.ts");
    expect(errorLines.join("\n")).toContain("TS2304");
  });

  it("logs a conflict warning when writeFiles reports a conflicted file", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    vi.mocked(writeFiles).mockResolvedValue([
      { path: "/out/f.ode.ts", created: false, conflicted: true },
    ]);
    await main(); // must not throw
    expect(exitCodes).toEqual([]);
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(expect.stringContaining("conflict"));
  });

  it("defaults to merge mode when neither --overwrite nor --no-overwrite is passed", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    await main();
    expect(vi.mocked(writeFiles)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "merge" }),
    );
  });

  it("logs the parsed command count and namespace", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    await main();
    expect(logLines.join("\n")).toContain("Parsed 1 command(s), namespace: test");
  });

  it("logs (none) as namespace when namespace is absent", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    vi.mocked(parseYaml).mockReturnValue({
      ...fakeConfigIndex,
      namespace: undefined as unknown as string,
    });
    await main();
    expect(logLines.join("\n")).toContain("namespace: (none)");
  });

  it("defaults --out to ./odetovibe when not specified", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    await main();
    expect(vi.mocked(writeFiles)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetDir: resolve("./odetovibe") }),
    );
  });

  it("propagates unexpected errors as rejections", async () => {
    process.argv = ["node", "cli.js", "/fake/config.yaml"];
    vi.mocked(writeFiles).mockRejectedValue(new Error("disk full"));
    await expect(main()).rejects.toThrow("disk full");
  });
});
