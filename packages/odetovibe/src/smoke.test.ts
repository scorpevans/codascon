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

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("generates golden output for smoke.yaml", async () => {
    tmpDir = mkdtempSync(`${tmpdir()}/odetovibe-smoke-`);

    const configIndex = parseYaml(resolve(fixturesDir, "smoke.yaml"));
    const result = validateYaml(configIndex);
    expect(result.valid, "smoke.yaml should be valid").toBe(true);

    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });

    const written = await writeFiles(project, { targetDir: tmpDir, mode: "overwrite" });
    for (const r of written) {
      expect(r.compileErrors ?? [], `${r.path} has no compile errors`).toHaveLength(0);
      const rel = r.path.slice(tmpDir.length + 1);
      const actual = readFileSync(r.path, "utf8");
      const expected = readFileSync(resolve(fixturesDir, "smoke-expected", rel), "utf8");
      expect(actual, `${rel} matches golden file`).toBe(expected);
    }
  });
});
