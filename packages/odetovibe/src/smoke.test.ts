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

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("generates golden output for smoke.yaml", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    const configIndex = parseYaml(resolve(fixturesDir, "smoke.yaml"));
    const result = validateYaml(configIndex);
    expect(result.valid, "smoke.yaml should be valid").toBe(true);

    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });

    const written = await writeFiles(project, { targetDir: tmpDir, mode: "overwrite" });
    expect(written.length, "pipeline should write at least one file").toBeGreaterThan(0);
    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
      const rel = r.path.slice(tmpDir.length + 1);
      const actual = readFileSync(r.path, "utf8");
      const expected = readFileSync(resolve(fixturesDir, "smoke-expected", rel), "utf8");
      expect(actual, `${rel} matches golden file`).toBe(expected);
    }
  }, 20_000);
});
