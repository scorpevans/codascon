/*
 * @codascon/odetovibe — Smoke Test
 *
 * End-to-end pipeline test: parse smoke.yaml → validate → emit AST → write files.
 * Compares output against golden files in fixtures/smoke-expected/.
 *
 * This is the vitest companion to the CI smoke step. It catches regressions
 * in the codegen pipeline locally, without needing to pack and install the
 * package first.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { emitAst, parseYaml, validateYaml, writeFiles } from "./index.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

describe("smoke", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("merge mode preserves user method bodies across re-generation", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    const configIndex = parseYaml(resolve(fixturesDir, "smoke.yaml"));
    expect(validateYaml(configIndex).valid, "smoke.yaml must be valid").toBe(true);

    // First run: create files in overwrite mode
    const project1 = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project: project1 });
    await writeFiles(project1, { targetDir: tmpDir, mode: "overwrite" });

    // Simulate user implementation: replace the generated stub body with custom code
    const commandFile = resolve(tmpDir, "greet/commands/greet.ts");
    const original = readFileSync(commandFile, "utf8");
    writeFileSync(
      commandFile,
      original.replace(
        'throw new Error("Not implemented"); // @odetovibe-generated',
        "return object; // user implementation",
      ),
    );

    // Second run: merge — user body must survive
    const project2 = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project: project2 });
    const written = await writeFiles(project2, { targetDir: tmpDir, mode: "merge" });

    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
      expect(r.conflicted, `${r.path} has no conflict`).toBeFalsy();
    }
    const merged = readFileSync(commandFile, "utf8");
    expect(merged).toContain("return object; // user implementation");
  }, 20_000);

  it("strict mode runs the full pipeline cleanly when there is no structural conflict", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    const configIndex = parseYaml(resolve(fixturesDir, "smoke.yaml"));
    expect(validateYaml(configIndex).valid, "smoke.yaml must be valid").toBe(true);

    // First run: create files in overwrite mode
    const project1 = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project: project1 });
    await writeFiles(project1, { targetDir: tmpDir, mode: "overwrite" });

    // Second run: strict — same generated structure, no conflict expected
    const project2 = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project: project2 });
    const written = await writeFiles(project2, { targetDir: tmpDir, mode: "strict" });

    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
      expect(r.conflicted, `${r.path} must not conflict`).toBeFalsy();
    }
  }, 20_000);

  it("validateYaml reports errors for a YAML with broken domain-type references", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    // A YAML that parses cleanly but violates the baseType-ref / objectType-ref /
    // returnType-ref validation rules. The pipeline must detect this and the caller
    // must not proceed to emitAst / writeFiles.
    const invalidYaml = [
      "domainTypes:",
      "  User:",
      "    resolverName: resolveUser",
      "commands:",
      "  GreetCommand:",
      "    commandName: greet",
      "    baseType: NonExistent",
      "    objectType: AlsoNonExistent",
      "    returnType: AndThisOneToo",
      "    subjectUnion: [User]",
      "    dispatch:",
      "      User: UserGreeter",
      "    templates:",
      "      UserGreeter:",
      "        isParameterized: false",
      "        strategies: {}",
    ].join("\n");

    writeFileSync(resolve(tmpDir, "invalid.yaml"), invalidYaml);
    const configIndex = parseYaml(resolve(tmpDir, "invalid.yaml"));
    const result = validateYaml(configIndex);

    expect(result.valid).toBe(false);
    const allErrors = result.validationResults.flatMap((r) => r.errors);
    expect(allErrors.length).toBeGreaterThan(0);
    const ruleIds = allErrors.map((e) => e.rule);
    expect(ruleIds).toContain("baseType-ref");
    expect(ruleIds).toContain("objectType-ref");
    expect(ruleIds).toContain("returnType-ref");
  }, 20_000);

  it("full pipeline handles abstract templates with strategies", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    // smoke.yaml has only a non-parameterized template; this covers the parameterized template +
    // strategy code path: parameterized abstract class, two strategies with
    // distinct subjectSubsets, dispatch via plain strategy names.
    const strategyYaml = [
      "namespace: access",
      "",
      "domainTypes:",
      "  Person:",
      "  User:",
      "    resolverName: resolveUser",
      "  Admin:",
      "    resolverName: resolveAdmin",
      "  AccessResult:",
      "",
      "commands:",
      "  AccessCommand:",
      "    commandName: access",
      "    baseType: Person",
      "    objectType: AccessResult",
      "    returnType: AccessResult",
      "    subjectUnion: [User, Admin]",
      "    dispatch:",
      "      User: AccessTemplate.UserGrant",
      "      Admin: AccessTemplate.AdminGrant",
      "    templates:",
      "      AccessTemplate:",
      "        isParameterized: true",
      "        strategies:",
      "          UserGrant:",
      "            subjectSubset: [User]",
      "          AdminGrant:",
      "            subjectSubset: [Admin]",
    ].join("\n");

    writeFileSync(resolve(tmpDir, "strategy.yaml"), strategyYaml);
    const configIndex = parseYaml(resolve(tmpDir, "strategy.yaml"));
    const result = validateYaml(configIndex);
    expect(result.valid, "strategy YAML must be valid").toBe(true);

    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });
    const written = await writeFiles(project, { targetDir: tmpDir, mode: "overwrite" });

    expect(written.length, "pipeline should write at least one file").toBeGreaterThan(0);
    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
    }

    const commandFile = written.find((r) => r.path.includes("/commands/access.ts"));
    expect(commandFile, "command file should be written").toBeDefined();
    const content = readFileSync(commandFile!.path, "utf8");
    expect(content).toContain("abstract class AccessTemplate");
    expect(content).toContain("class UserGrant");
    expect(content).toContain("class AdminGrant");
  }, 20_000);

  it("returnAsync: true — parameterized and non-parameterized template execute are async and return Promise<T>", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    // One command with returnAsync: true.
    // Uses one parameterized template (UserTemplate, with a strategy) and one
    // non-parameterized template (AdminGreeter, with a default strategy), to verify
    // all emitter paths in a single pipeline run:
    //   • parameterized template execute — async + Promise<T>
    //   • non-parameterized template execute — async + Promise<T>
    //   • strategy execute — async + Promise<T>
    const asyncYaml = [
      "namespace: hello",
      "",
      "domainTypes:",
      "  Person:",
      "  User:",
      "    resolverName: resolveUser",
      "  Admin:",
      "    resolverName: resolveAdmin",
      "  Greeting:",
      "",
      "commands:",
      "  HelloCommand:",
      "    commandName: hello",
      "    baseType: Person",
      "    objectType: Greeting",
      "    returnType: Greeting",
      "    returnAsync: true",
      "    subjectUnion: [User, Admin]",
      "    dispatch:",
      "      User: UserTemplate.StandardGreet",
      "      Admin: AdminGreeterDefault",
      "    templates:",
      "      UserTemplate:",
      "        isParameterized: true",
      "        strategies:",
      "          StandardGreet:",
      "            subjectSubset: [User]",
      "      AdminGreeter:",
      "        isParameterized: false",
      "        strategies:",
      "          AdminGreeterDefault: {}",
    ].join("\n");

    writeFileSync(resolve(tmpDir, "hello.yaml"), asyncYaml);
    const configIndex = parseYaml(resolve(tmpDir, "hello.yaml"));
    expect(validateYaml(configIndex).valid, "hello.yaml must be valid").toBe(true);

    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });
    const written = await writeFiles(project, { targetDir: tmpDir, mode: "overwrite" });

    expect(written.length, "pipeline should write at least one file").toBeGreaterThan(0);
    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
    }

    const commandFile = written.find((r) => r.path.includes("/commands/hello.ts"));
    expect(commandFile, "command file should be written").toBeDefined();
    const content = readFileSync(commandFile!.path, "utf8");

    // Parameterized template: concrete execute stub, async, returns Promise<Greeting>
    expect(content).toContain("abstract class UserTemplate");
    expect(content).not.toContain("abstract execute");

    // Non-parameterized template: abstract class + async execute + Promise<Greeting>
    expect(content).toContain("abstract class AdminGreeter");

    // Strategy: no execute emitted — inherited from template
    expect(content).toContain("class StandardGreet");
    expect(content).toMatch(/class StandardGreet[^{]*\{\s*\}/s);

    // All execute methods must be async and return Promise<Greeting>
    const execMatches = [...content.matchAll(/\basync\s+execute\s*\(/g)];
    expect(execMatches.length, "at least two async execute stubs").toBeGreaterThanOrEqual(2);
    expect(content).toMatch(/async\s+execute[^{]*Promise<Greeting>/);
  }, 20_000);

  it("returnAsync absent — template execute are not async and return T directly", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    // Same domain structure as the returnAsync test above, but without returnAsync.
    const syncYaml = [
      "namespace: hello",
      "",
      "domainTypes:",
      "  Person:",
      "  User:",
      "    resolverName: resolveUser",
      "  Admin:",
      "    resolverName: resolveAdmin",
      "  Greeting:",
      "",
      "commands:",
      "  HelloCommand:",
      "    commandName: hello",
      "    baseType: Person",
      "    objectType: Greeting",
      "    returnType: Greeting",
      "    subjectUnion: [User, Admin]",
      "    dispatch:",
      "      User: UserTemplate.StandardGreet",
      "      Admin: AdminGreeterDefault",
      "    templates:",
      "      UserTemplate:",
      "        isParameterized: true",
      "        strategies:",
      "          StandardGreet:",
      "            subjectSubset: [User]",
      "      AdminGreeter:",
      "        isParameterized: false",
      "        strategies:",
      "          AdminGreeterDefault: {}",
    ].join("\n");

    writeFileSync(resolve(tmpDir, "hello-sync.yaml"), syncYaml);
    const configIndex = parseYaml(resolve(tmpDir, "hello-sync.yaml"));
    expect(validateYaml(configIndex).valid, "hello-sync.yaml must be valid").toBe(true);

    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });
    const written = await writeFiles(project, { targetDir: tmpDir, mode: "overwrite" });

    expect(written.length, "pipeline should write at least one file").toBeGreaterThan(0);
    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
    }

    const commandFile = written.find((r) => r.path.includes("/commands/hello.ts"));
    expect(commandFile, "command file should be written").toBeDefined();
    const content = readFileSync(commandFile!.path, "utf8");

    // All templates (regardless of strategy presence) emit abstract class
    expect(content).toContain("abstract class UserTemplate");
    expect(content).toContain("abstract class AdminGreeter");

    // No execute method should have async or Promise<T>
    expect(content).not.toContain("async execute");
    expect(content).not.toContain("Promise<Greeting>");

    // All execute return types should be the bare Greeting type
    const returnTypeMatches = [...content.matchAll(/execute\([^)]*\)[^{]*:\s*([^\s{;]+)/g)];
    expect(returnTypeMatches.length, "at least one execute return type found").toBeGreaterThan(0);
    for (const m of returnTypeMatches) {
      expect(m[1].trim(), `execute return type should be Greeting, not Promise-wrapped`).toBe(
        "Greeting",
      );
    }
  }, 20_000);

  it("generates golden output for smoke.yaml", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    const configIndex = parseYaml(resolve(fixturesDir, "smoke.yaml"));
    const result = validateYaml(configIndex);
    expect(result.valid, "smoke.yaml should be valid").toBe(true);

    // Copy golden files into tmpDir as the existing user-modified files, then
    // merge — the golden files must survive re-generation unchanged.
    const goldenDir = resolve(fixturesDir, "smoke-expected");
    cpSync(goldenDir, tmpDir, { recursive: true });

    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });

    const written = await writeFiles(project, { targetDir: tmpDir, mode: "merge" });
    expect(written.length, "pipeline should write at least one file").toBeGreaterThan(0);
    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
      const rel = r.path.slice(tmpDir.length + 1);
      const actual = readFileSync(r.path, "utf8");
      const expected = readFileSync(resolve(goldenDir, rel), "utf8");
      expect(actual, `${rel} matches golden file`).toBe(expected);
    }
  }, 20_000);
});
