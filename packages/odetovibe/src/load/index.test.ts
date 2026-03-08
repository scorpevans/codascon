/**
 * @codascon/odetovibe — Load Domain Tests
 *
 * Covers:
 *   - OverwriteWriter: file written at correct path, header prepended,
 *     parent directories created, created flag, overwrite flag
 *   - MergeWriter: new-file fallback, import union, class/method/interface
 *     merge, user-body preservation, header deduplication
 *   - WriteFileCommand: routing to OverwriteWriter vs MergeWriter
 *   - writeFiles: iterates all SourceFiles, returns one result per file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { Project } from "ts-morph";
import { WriteFileCommand, SourceFileEntry, writeFiles } from "./index.js";
import type { WriteContext, WriteMode } from "./index.js";
import {
  SubjectTypeEntry,
  PlainTypeEntry,
  CommandEntry,
  AbstractTemplateEntry,
  StrategyEntry,
} from "../extract/domain-types.js";
import type { ConfigIndex } from "../extract/domain-types.js";
import { emitAst } from "../transform/index.js";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

const tmpDirs: string[] = [];

/** Create a fresh temporary directory and register it for cleanup. */
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odetovibe-load-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Create an in-memory Project with one or more pre-populated SourceFiles. */
function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

const writeCmd = new WriteFileCommand();

function ctx(targetDir: string, mode: WriteMode = "overwrite"): WriteContext {
  return { targetDir, mode };
}

// ═══════════════════════════════════════════════════════════════════
// OverwriteWriter (via WriteFileCommand)
// ═══════════════════════════════════════════════════════════════════

describe("OverwriteWriter", () => {
  it("writes the file to targetDir/<sourceFilePath>", async () => {
    const project = makeProject({ "domain-types.ts": "export interface Foo {}" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(fs.existsSync(path.join(tmpDir, "domain-types.ts"))).toBe(true);
  });

  it("resolves nested paths relative to targetDir", async () => {
    const project = makeProject({ "campus/commands/access-building.ts": "export class Foo {}" });
    const sf = project.getSourceFileOrThrow("campus/commands/access-building.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(fs.existsSync(path.join(tmpDir, "campus/commands/access-building.ts"))).toBe(true);
  });

  it("creates parent directories that do not exist", async () => {
    const project = makeProject({ "a/b/c/deep.ts": "export const x = 1;" });
    const sf = project.getSourceFileOrThrow("a/b/c/deep.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(fs.existsSync(path.join(tmpDir, "a/b/c/deep.ts"))).toBe(true);
  });

  it("prepends the @odetovibe-generated header to the file content", async () => {
    const project = makeProject({ "domain-types.ts": "export interface Foo {}" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    const written = fs.readFileSync(path.join(tmpDir, "domain-types.ts"), "utf-8");
    expect(written.startsWith("/* @odetovibe-generated */")).toBe(true);
  });

  it("the body after the header matches the SourceFile's full text", async () => {
    const body = "export interface Foo { name: string; }";
    const project = makeProject({ "domain-types.ts": body });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    const written = fs.readFileSync(path.join(tmpDir, "domain-types.ts"), "utf-8");
    expect(written).toContain("name: string");
  });

  it("returns created:true when the file did not exist before", async () => {
    const project = makeProject({ "domain-types.ts": "" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(result.created).toBe(true);
  });

  it("returns created:false when the file already existed", async () => {
    const project = makeProject({ "domain-types.ts": "" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    // Pre-create the file
    fs.writeFileSync(path.join(tmpDir, "domain-types.ts"), "// existing");

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(result.created).toBe(false);
  });

  it("returns the absolute path of the written file", async () => {
    const project = makeProject({ "domain-types.ts": "" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(result.path).toBe(path.join(tmpDir, "domain-types.ts"));
  });

  it("overwrites an existing file's content", async () => {
    const project = makeProject({ "domain-types.ts": "export interface Bar {}" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    fs.writeFileSync(path.join(tmpDir, "domain-types.ts"), "// old content");
    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    const written = fs.readFileSync(path.join(tmpDir, "domain-types.ts"), "utf-8");
    expect(written).toContain("interface Bar");
    expect(written).not.toContain("// old content");
  });

  it("applies Prettier formatting to generated content before writing", async () => {
    // Prettier always expands interface properties to multi-line.
    // If Prettier were not applied, the original single-line form would appear.
    const body = "export interface Foo { name: string; }";
    const project = makeProject({ "f.ts": body });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    // Prettier expands the inline properties — original single-line form must be gone
    expect(written).not.toContain("{ name: string; }");
    expect(written).toContain("name: string;");
  });
});

// ═══════════════════════════════════════════════════════════════════
// writeFiles — orchestration
// ═══════════════════════════════════════════════════════════════════

describe("writeFiles", () => {
  it("returns one WriteResult per SourceFile in the project", async () => {
    const project = makeProject({
      "domain-types.ts": "",
      "commands/access-building.ts": "",
      "commands/audit.ts": "",
    });
    const tmpDir = makeTmpDir();

    const results = await writeFiles(project, ctx(tmpDir));

    expect(results).toHaveLength(3);
  });

  it("writes every SourceFile to disk", async () => {
    const project = makeProject({
      "domain-types.ts": "export interface Foo {}",
      "commands/access-building.ts": "export class Bar {}",
    });
    const tmpDir = makeTmpDir();

    await writeFiles(project, ctx(tmpDir));

    expect(fs.existsSync(path.join(tmpDir, "domain-types.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "commands/access-building.ts"))).toBe(true);
  });

  it("each written file starts with the @odetovibe-generated header", async () => {
    const project = makeProject({
      "domain-types.ts": "export interface Foo {}",
      "commands/access-building.ts": "export class Bar {}",
    });
    const tmpDir = makeTmpDir();

    await writeFiles(project, ctx(tmpDir));

    for (const rel of ["domain-types.ts", "commands/access-building.ts"]) {
      const written = fs.readFileSync(path.join(tmpDir, rel), "utf-8");
      expect(written.startsWith("/* @odetovibe-generated */")).toBe(true);
    }
  });

  it("marks newly created files with created:true and existing files with created:false", async () => {
    const project = makeProject({
      "new.ts": "",
      "existing.ts": "",
    });
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "// pre-existing");

    const results = await writeFiles(project, ctx(tmpDir));

    const byName = Object.fromEntries(results.map((r) => [path.basename(r.path), r.created]));
    expect(byName["new.ts"]).toBe(true);
    expect(byName["existing.ts"]).toBe(false);
  });

  it("returns an empty array when the project has no SourceFiles", async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const tmpDir = makeTmpDir();

    expect(await writeFiles(project, ctx(tmpDir))).toHaveLength(0);
  });

  it("preserves user-added classes when mode is 'merge'", async () => {
    const project = makeProject({ "f.ts": "export class Generated {}" });
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Generated {}\nexport class UserClass {}",
    );

    await writeFiles(project, ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("UserClass");
    expect(written).toContain("Generated");
  });

  it("merges in-place and preserves user classes when mode is 'strict' and no conflict exists", async () => {
    const project = makeProject({ "f.ts": "export class Generated {}" });
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Generated {}\nexport class UserClass {}",
    );

    const results = await writeFiles(project, ctx(tmpDir, "strict"));

    expect(results[0].conflicted).toBeFalsy();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("UserClass");
    expect(written).toContain("Generated");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MergeWriter (via WriteFileCommand with overwrite:false)
// ═══════════════════════════════════════════════════════════════════

describe("MergeWriter", () => {
  // ── new-file fallback ───────────────────────────────────────────

  it("creates file with header when file does not exist (fallback to overwrite)", async () => {
    const project = makeProject({ "domain-types.ts": "export interface Foo {}" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    expect(fs.existsSync(path.join(tmpDir, "domain-types.ts"))).toBe(true);
    expect(result.created).toBe(true);
    const written = fs.readFileSync(path.join(tmpDir, "domain-types.ts"), "utf-8");
    expect(written.startsWith("/* @odetovibe-generated */")).toBe(true);
  });

  it("returns created:false when file already exists", async () => {
    const project = makeProject({ "domain-types.ts": "export interface Foo {}" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "domain-types.ts"),
      "/* @odetovibe-generated */\nexport interface Foo {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    expect(result.created).toBe(false);
  });

  // ── imports ─────────────────────────────────────────────────────

  it("adds missing import declaration from generated file", async () => {
    const project = makeProject({
      "domain-types.ts": `import { Subject } from "codascon";\nexport class Foo extends Subject { readonly visitName = "resolveFoo" as const; }`,
    });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();
    // Existing file has no imports at all
    fs.writeFileSync(
      path.join(tmpDir, "domain-types.ts"),
      '/* @odetovibe-generated */\nexport class Foo extends Subject { readonly visitName = "resolveFoo" as const; }',
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "domain-types.ts"), "utf-8");
    expect(written).toContain('from "codascon"');
  });

  it("adds missing named import to an existing import declaration", async () => {
    const project = makeProject({
      "domain-types.ts": `import type { Foo, Bar } from "./schema.js";\nexport interface X {}`,
    });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();
    // Existing file only imports Foo
    fs.writeFileSync(
      path.join(tmpDir, "domain-types.ts"),
      `/* @odetovibe-generated */\nimport type { Foo } from "./schema.js";\nexport interface X {}`,
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "domain-types.ts"), "utf-8");
    expect(written).toContain("Bar");
    expect(written).toContain("Foo");
  });

  it("adds an import by its original name even when existing file imports it under an alias", async () => {
    // Generated needs `DomainType`; existing has `DomainType as SchemaDomainType`.
    // `DomainType` is not in scope in the existing file, so it must be added without aliasing.
    const project = makeProject({
      "f.ts": `import type { DomainType } from "./schema.js";\nexport class Foo { config: DomainType }`,
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      `/* @odetovibe-generated */\nimport type { DomainType as SchemaDomainType } from "./schema.js";\nexport class Foo { config: SchemaDomainType }`,
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    // Plain DomainType must now be in scope
    expect(written).toMatch(/import type \{[^}]*\bDomainType\b[^}]*\} from "\.\/schema\.js"/);
  });

  it("adds a namespace import alongside an existing named import from the same module", async () => {
    // Generated needs `import * as fs from "node:fs"`;
    // existing has `import { readFileSync } from "node:fs"`.
    // They must coexist as separate declarations — not be merged into one.
    const project = makeProject({
      "f.ts": `import * as fs from "node:fs";\nexport class Foo {}`,
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      `/* @odetovibe-generated */\nimport { readFileSync } from "node:fs";\nexport class Foo {}`,
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("import * as fs");
    expect(written).toContain("readFileSync");
  });

  it("does not add a duplicate namespace import when one already exists", async () => {
    const project = makeProject({
      "f.ts": `import * as fs from "node:fs";\nexport class Foo {}`,
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      `/* @odetovibe-generated */\nimport * as fs from "node:fs";\nexport class Foo {}`,
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    const count = (written.match(/import \* as fs/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("preserves user-added imports not present in generated file", async () => {
    const project = makeProject({ "domain-types.ts": "export interface Foo {}" });
    const sf = project.getSourceFileOrThrow("domain-types.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "domain-types.ts"),
      `/* @odetovibe-generated */\nimport { myUtil } from "./my-utils.js";\nexport interface Foo {}`,
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "domain-types.ts"), "utf-8");
    expect(written).toContain("my-utils");
  });

  // ── implements ───────────────────────────────────────────────────

  it("preserves user-added implements clause absent from generated class", async () => {
    // Codegen generates no implements; user added `implements ConfigEntry`
    const generated = `export class Foo extends Subject {}`;
    const existing = `/* @odetovibe-generated */
export class Foo extends Subject implements ConfigEntry {}`;
    const project = makeProject({ "f.ts": generated });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existing);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("implements ConfigEntry");
  });

  it("updates generated implements type args while keeping user-added implements", async () => {
    // Codegen changes type arg; user-added interface must survive
    const generated = `import type { Template, Cmd, NewType } from "./types.js";
export class Foo implements Template<Cmd, [], NewType> {}`;
    const existing = `/* @odetovibe-generated */
import type { Template, Cmd, OldType, UserInterface } from "./types.js";
export class Foo implements Template<Cmd, [], OldType>, UserInterface {}`;
    const project = makeProject({ "f.ts": generated });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existing);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("Template<Cmd, [], NewType>");
    expect(written).not.toContain("Template<Cmd, [], OldType>");
    expect(written).toContain("UserInterface");
  });

  // ── classes ─────────────────────────────────────────────────────

  it("adds a class that does not exist in the existing file", async () => {
    const project = makeProject({ "f.ts": "export class NewClass {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\n");

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("class NewClass");
  });

  it("preserves a class absent from the generated file", async () => {
    const project = makeProject({ "f.ts": "export class GenClass {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class GenClass {}\nexport class UserClass {}",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("UserClass");
  });

  it("updates signature and preserves body even when body contains @odetovibe-generated", async () => {
    const generated = `import type { NewType, NewResult } from "./types.js";
export class Cmd {
  run(subject: NewType): NewResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}`;
    const existing = `/* @odetovibe-generated */
import type { OldType, OldResult } from "./types.js";
export class Cmd {
  run(subject: OldType): OldResult {
    throw new Error("existingStub"); // @odetovibe-generated
  }
}`;
    const project = makeProject({ "f.ts": generated });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existing);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    // Signature updated
    expect(written).toContain("NewType");
    expect(written).toContain("NewResult");
    // Body preserved — not replaced by generated stub
    expect(written).toContain("existingStub");
  });

  it("preserves a user-implemented method body and updates the signature", async () => {
    const generated = `import type { NewType, Context, NewResult } from "./types.js";
export class Cmd {
  run(subject: NewType, object: Context): NewResult {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}`;
    const existing = `/* @odetovibe-generated */
import type { OldType, OldResult } from "./types.js";
export class Cmd {
  run(subject: OldType): OldResult {
    throw new Error("userImplementation");
  }
}`;
    const project = makeProject({ "f.ts": generated });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existing);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    // Signature updated
    expect(written).toContain("NewType");
    expect(written).toContain("NewResult");
    // User body preserved
    expect(written).toContain("userImplementation");
  });

  // ── jsdoc preservation ───────────────────────────────────────────

  it("preserves JSDoc on a class during merge", async () => {
    const generated = `export class Foo {}`;
    const existing = `/* @odetovibe-generated */
/** My class doc. */
export class Foo {}`;
    const project = makeProject({ "f.ts": generated });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existing);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("My class doc.");
  });

  it("preserves JSDoc on a method during merge", async () => {
    const generated = `import type { NewType, NewResult } from "./types.js";
export class Foo {
  bar(x: NewType): NewResult { throw new Error(); }
}`;
    const existing = `/* @odetovibe-generated */
import type { OldType, OldResult } from "./types.js";
export class Foo {
  /** My method doc. */
  bar(x: OldType): OldResult { throw new Error("oldImpl"); }
}`;
    const project = makeProject({ "f.ts": generated });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existing);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("My method doc.");
    expect(written).toContain("NewType");
  });

  it("preserves JSDoc on a property during merge", async () => {
    const generated = `import type { NewType } from "./types.js";
export class Foo {
  readonly x: NewType = 0;
}`;
    const existing = `/* @odetovibe-generated */
import type { OldType } from "./types.js";
export class Foo {
  /** My property doc. */
  readonly x: OldType = 0;
}`;
    const project = makeProject({ "f.ts": generated });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existing);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("My property doc.");
    expect(written).toContain("NewType");
  });

  // ── interfaces ───────────────────────────────────────────────────

  it("adds an interface that does not exist in the existing file", async () => {
    const project = makeProject({ "f.ts": "export interface NewIface { x: number; }" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\n");

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("interface NewIface");
    expect(written).toContain("x: number");
  });

  it("drops generated interface properties when the interface already exists (user owns interface content)", async () => {
    // The merge contract: if an interface already exists, its content is entirely
    // user-owned and is never replaced or augmented by generated output.
    // Even if the generated version has new properties they are silently dropped.
    const project = makeProject({
      "f.ts": "export interface Ctx { id: number; label: string; }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing file has an empty stub — user has not added anything yet
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport interface Ctx {}",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    // Generated properties must NOT be injected — user owns the interface body
    expect(written).not.toContain("id: number");
    expect(written).not.toContain("label: string");
    expect(written).toContain("interface Ctx");
  });

  it("leaves an existing interface entirely untouched (user owns all interface content)", async () => {
    // Generated has an empty stub `Ctx {}`; existing has user-written fields and JSDoc.
    // Existing interface must be preserved byte-for-byte — nothing from generated replaces it.
    const project = makeProject({ "f.ts": "export interface Ctx {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\n/** My interface doc. */\nexport interface Ctx { x: number; extra: boolean; }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("My interface doc.");
    expect(written).toContain("x: number");
    expect(written).toContain("extra: boolean");
  });

  // ── header ───────────────────────────────────────────────────────

  it("does not duplicate the @odetovibe-generated header on repeated merges", async () => {
    const project = makeProject({ "f.ts": "export interface Foo {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport interface Foo {}",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    const count = (written.match(/\* @odetovibe-generated \*\//g) ?? []).length;
    expect(count).toBe(1);
  });

  // ── prettier ──────────────────────────────────────────────────────

  it("applies Prettier formatting when creating a new file (no-existing fallback)", async () => {
    const body = "export interface Foo { name: string; }";
    const project = makeProject({ "f.ts": body });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).not.toContain("{ name: string; }");
    expect(written).toContain("name: string;");
  });

  it("applies Prettier formatting to the merged result when file already exists", async () => {
    const body = "export interface Foo { name: string; }";
    const project = makeProject({ "f.ts": body });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport interface Foo { name: string; }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).not.toContain("{ name: string; }");
    expect(written).toContain("name: string;");
  });
});

// ═══════════════════════════════════════════════════════════════════
// compileErrors — pre-write type-check gate
//
// Each writer calls checkDiagnostics on the final text before writing.
// When errors are found the file is NOT written and compileErrors is
// populated in the returned WriteResult.
// ═══════════════════════════════════════════════════════════════════

describe("compileErrors", () => {
  it("returns compileErrors when generated content has undeclared names", async () => {
    // "UndeclaredBase" is not imported and not defined — produces TS2304 in the
    // isolated in-memory type-checker (TS2304 is not in FALLBACK_FILTERED_CODES).
    const project = makeProject({ "f.ts": "export class Foo extends UndeclaredBase {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
  });

  it("does not write the file when compileErrors are present", async () => {
    const project = makeProject({ "f.ts": "export class Foo extends UndeclaredBase {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(fs.existsSync(path.join(tmpDir, "f.ts"))).toBe(false);
  });

  it("returns compileErrors in merge mode when generated content has undeclared names", async () => {
    const project = makeProject({ "f.ts": "export class Foo extends UndeclaredBase {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// WriteFileCommand routing
// ═══════════════════════════════════════════════════════════════════

describe("WriteFileCommand routing", () => {
  it("uses OverwriteWriter when mode:'overwrite' (always writes, ignores existing content)", async () => {
    const project = makeProject({ "f.ts": "export class Generated {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class UserClass {}",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "overwrite"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    // OverwriteWriter replaces entirely — UserClass must be gone
    expect(written).not.toContain("UserClass");
    expect(written).toContain("Generated");
  });

  it("uses MergeWriter when mode:'merge' (preserves absent classes)", async () => {
    const project = makeProject({ "f.ts": "export class Generated {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Generated {}\nexport class UserClass {}",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    // MergeWriter preserves UserClass since it's not in generated output
    expect(written).toContain("UserClass");
    expect(written).toContain("Generated");
  });

  it("uses StrictMergeWriter when mode:'strict' (merges when no conflict)", async () => {
    const project = makeProject({ "f.ts": "export class Generated {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing file matches generated — no conflict
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Generated {}\nexport class UserClass {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    // No conflict: merges in-place, UserClass preserved
    expect(result.conflicted).toBeFalsy();
    expect(result.path).toBe(path.join(tmpDir, "f.ts"));
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("UserClass");
  });
});

// ═══════════════════════════════════════════════════════════════════
// StrictMergeWriter (via WriteFileCommand with mode:"strict")
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter", () => {
  // ── new-file fallback ───────────────────────────────────────────

  it("creates file with header when file does not exist", async () => {
    const project = makeProject({ "f.ts": "export class Foo {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(fs.existsSync(path.join(tmpDir, "f.ts"))).toBe(true);
    expect(result.created).toBe(true);
    expect(result.conflicted).toBeUndefined();
  });

  // ── no-conflict cases ─────────────────────────────────────────

  it("merges in-place when no codegen-owned slot differs", async () => {
    const project = makeProject({ "f.ts": "export class Foo extends Subject {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo extends Subject {}\nexport class UserClass {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.path).toBe(path.join(tmpDir, "f.ts"));
    expect(result.conflicted).toBeFalsy();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("UserClass");
  });

  it("merges in-place when generated adds a new class (no existing class modified)", async () => {
    const project = makeProject({ "f.ts": "export class NewClass {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class UserClass {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.path).toBe(path.join(tmpDir, "f.ts"));
    expect(result.conflicted).toBeFalsy();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("NewClass");
    expect(written).toContain("UserClass");
  });

  // ── conflict cases ─────────────────────────────────────────────

  it("writes .ode.ts and returns conflicted:true when class extends clause differs", async () => {
    const project = makeProject({ "f.ts": "export class Foo extends Error {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo extends RegExp {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
    expect(fs.existsSync(path.join(tmpDir, "f.ode.ts"))).toBe(true);
    // Original file is untouched
    const original = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(original).toContain("RegExp");
    expect(original).not.toContain("Error");
  });

  it("writes .ode.ts when a method signature differs from generated", async () => {
    const project = makeProject({
      "f.ts": `export class Cmd { execute(subject: string): number { throw new Error(); } }`,
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      `/* @odetovibe-generated */\nexport class Cmd { execute(subject: boolean): void { return; } }`,
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
    // Original file is untouched
    const original = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(original).toContain("boolean");
  });

  it("the .ode.ts file contains the generated content with the header", async () => {
    const project = makeProject({ "f.ts": "export class Foo extends Error {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo extends RegExp {}",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    const odeContent = fs.readFileSync(path.join(tmpDir, "f.ode.ts"), "utf-8");
    expect(odeContent.startsWith("/* @odetovibe-generated */")).toBe(true);
    expect(odeContent).toContain("extends Error");
  });

  it("writes .ode.ts when an import changes from type-only to value import", async () => {
    // A type-only → value import change is a codegen-owned structural change:
    // codegen has decided the import must be a value import, not erased at runtime.
    // StrictMergeWriter must detect this and write to .ode.ts rather than merging.
    const project = makeProject({
      "f.ts": `import { Foo } from "./types.js";\nexport class Bar {}`,
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      `/* @odetovibe-generated */\nimport type { Foo } from "./types.js";\nexport class Bar {}`,
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });

  it("inserts .ode before the final extension for multi-dot filenames", async () => {
    // conflictPath("access-building.test.ts") must produce "access-building.test.ode.ts",
    // NOT "access-building.ode.test.ts" — .ode is always inserted before the last extension.
    const project = makeProject({
      "access-building.test.ts": "export class Foo extends Error {}",
    });
    const sf = project.getSourceFileOrThrow("access-building.test.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "access-building.test.ts"),
      "/* @odetovibe-generated */\nexport class Foo extends RegExp {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "access-building.test.ode.ts"));
    expect(fs.existsSync(path.join(tmpDir, "access-building.test.ode.ts"))).toBe(true);
    const original = fs.readFileSync(path.join(tmpDir, "access-building.test.ts"), "utf-8");
    expect(original).toContain("RegExp");
  });

  // ── prettier ──────────────────────────────────────────────────────

  it("applies Prettier formatting when creating a new file (no-existing fallback)", async () => {
    const body = "export interface Foo { name: string; }";
    const project = makeProject({ "f.ts": body });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).not.toContain("{ name: string; }");
    expect(written).toContain("name: string;");
  });

  it("applies Prettier formatting when merging in-place (no-conflict path)", async () => {
    // The no-conflict path applies formatCode to the merged text before writing.
    // An unformatted interface in the existing file (user-owned, preserved through
    // merge) must be expanded by Prettier in the final output.
    const project = makeProject({ "f.ts": "export class Foo {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo {}\nexport interface Bar { x: number; }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).not.toContain("{ x: number; }");
    expect(written).toContain("x: number;");
  });
});

// ═══════════════════════════════════════════════════════════════════
// TypeScript diagnostics — pre-write quality gate
//
// Uses project.getPreEmitDiagnostics() to type-check the in-memory
// SourceFiles produced by emitAst before they are written to disk.
//
// TS2307 ("Cannot find module X") is always expected in the virtual
// file system because external modules (codascon, ts-morph, etc.)
// are not present there. All other errors indicate a codegen bug.
// TS2304 ("Cannot find name X") is the error produced when a type
// is referenced in generated code without a corresponding import.
// ═══════════════════════════════════════════════════════════════════

// TS2307 ("Cannot find module X") is always expected in the virtual file system
// and is not a codegen error — filter it before asserting.
const MODULE_NOT_FOUND = 2307;

function makeConfigIndexWithExternalType(imports: Record<string, string[]>): ConfigIndex {
  return {
    namespace: "test",
    imports,
    externalTypeKeys: new Set(),
    subjectTypes: new Map([["Foo", new SubjectTypeEntry("Foo", { visitName: "resolveFoo" })]]),
    plainTypes: new Map(),
    commands: new Map(),
    abstractTemplates: new Map(),
    concreteTemplates: new Map(),
    strategies: new Map(),
  };
}

describe("TypeScript diagnostics", () => {
  it("no unresolved names when imports are declared", async () => {
    const configIndex = makeConfigIndexWithExternalType({ "external-module": ["ExternalType"] });
    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });

    const diagnostics = project
      .getPreEmitDiagnostics()
      .filter((d) => d.getCode() !== MODULE_NOT_FOUND);

    expect(diagnostics).toHaveLength(0);
  });

  it("no type errors when a full command + abstract template + strategy are emitted", () => {
    // Regression guard: StrategyClassEmitter must emit execute with correct imports.
    // Without the execute stub, TypeScript emits TS2515 (non-abstract class does not
    // implement inherited abstract member) — not TS2307, so it survives the filter.
    const cmd = new CommandEntry("AccessBuildingCommand", {
      commandName: "accessBuilding",
      baseType: "Person",
      objectType: "Building",
      returnType: "AccessResult",
      subjectUnion: ["Student"],
      dispatch: { Student: "AccessTemplate" },
      templates: {
        AccessTemplate: { isParameterized: true, strategies: { DepartmentMatch: {} } },
      },
    });
    const abstractTpl = new AbstractTemplateEntry("AccessTemplate", "AccessBuildingCommand", {
      isParameterized: true,
      subjectSubset: ["Student"],
      strategies: { DepartmentMatch: {} },
    });
    const strat = new StrategyEntry("DepartmentMatch", "AccessTemplate", "AccessBuildingCommand", {
      subjectSubset: ["Student"],
    });
    const configIndex: ConfigIndex = {
      namespace: undefined,
      imports: {},
      externalTypeKeys: new Set(),
      subjectTypes: new Map([
        ["Student", new SubjectTypeEntry("Student", { visitName: "resolveStudent" })],
      ]),
      plainTypes: new Map([
        ["Person", new PlainTypeEntry("Person", {})],
        ["Building", new PlainTypeEntry("Building", {})],
        ["AccessResult", new PlainTypeEntry("AccessResult", {})],
      ]),
      commands: new Map([["AccessBuildingCommand", cmd]]),
      abstractTemplates: new Map([["AccessBuildingCommand.AccessTemplate", abstractTpl]]),
      concreteTemplates: new Map(),
      strategies: new Map([["AccessBuildingCommand.AccessTemplate.DepartmentMatch", strat]]),
    };
    const project = new Project({ useInMemoryFileSystem: true });
    emitAst(configIndex, { configIndex, project });

    const diagnostics = project
      .getPreEmitDiagnostics()
      .filter((d) => d.getCode() !== MODULE_NOT_FOUND);

    expect(diagnostics).toHaveLength(0);
  });
});
// Note: the "unresolved type when imports omitted" regression test was removed because
// domain type field content is no longer emitted — field types never appear in generated
// code, so there is no code path that could produce TS2304 for a missing domain type import.

// ═══════════════════════════════════════════════════════════════════
// detectIndentation — branch coverage via MergeWriter
//
// detectIndentation is called inside mergeFile whenever MergeWriter or
// StrictMergeWriter reconciles an existing file.  Its non-default
// branches (tab, four-space, two-space-via-match) require an existing
// file whose first indented line starts with the corresponding whitespace.
// ═══════════════════════════════════════════════════════════════════

describe("detectIndentation — indentation style of existing file", () => {
  it("handles tab-indented existing file without error", async () => {
    // First indented line starts with \t → tab branch of detectIndentation
    const existingContent =
      '/* @odetovibe-generated */\nexport class Foo {\n\treadonly visitName = "foo" as const;\n}';
    const project = makeProject({ "f.ts": "export class Foo {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existingContent);

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    expect(result.compileErrors).toBeUndefined();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("class Foo");
  });

  it("handles four-space-indented existing file without error", async () => {
    // First indented line starts with four spaces → four-space branch of detectIndentation
    const existingContent =
      '/* @odetovibe-generated */\nexport class Foo {\n    readonly visitName = "foo" as const;\n}';
    const project = makeProject({ "f.ts": "export class Foo {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existingContent);

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    expect(result.compileErrors).toBeUndefined();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("class Foo");
  });

  it("handles two-space-indented existing file without error", async () => {
    // First indented line starts with 2 spaces → falls into the else branch (length < 4)
    // via the match path, not the no-match default (the no-match default is exercised by
    // the majority of other merge tests whose existing content has no leading whitespace).
    const existingContent =
      '/* @odetovibe-generated */\nexport class Foo {\n  readonly visitName = "foo" as const;\n}';
    const project = makeProject({ "f.ts": "export class Foo {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), existingContent);

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    expect(result.compileErrors).toBeUndefined();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("class Foo");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MergeWriter — constructor merge
//
// mergeClass replaces all existing constructors with the generated ones
// whenever the generated class declares any constructor.
// ═══════════════════════════════════════════════════════════════════

describe("MergeWriter — constructor merge", () => {
  it("replaces the existing constructor when generated class declares a different one", async () => {
    const project = makeProject({
      "f.ts": "export class Foo { constructor(readonly x: string) {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing has a no-arg constructor — generated replaces it
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { constructor() {} }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("x: string");
  });

  it("adds a constructor when the existing class has none", async () => {
    const project = makeProject({
      "f.ts": "export class Foo { constructor(readonly x: string) {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing has no constructor at all
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\nexport class Foo {}");

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("x: string");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MergeWriter — abstract method merge
//
// mergeMethod replaces the existing method entirely when the generated
// method is abstract (abstract methods have no body to preserve).
// ═══════════════════════════════════════════════════════════════════

describe("MergeWriter — abstract method", () => {
  it("replaces a concrete method body when generated method is abstract", async () => {
    const project = makeProject({
      "f.ts": "export abstract class Foo { abstract execute(x: string): void; }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing has a concrete method with the same name — merge must make it abstract
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport abstract class Foo { execute(x: string): void { return; } }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("abstract execute");
    // Concrete body must not survive — the generated abstract declaration replaces it entirely
    expect(written).not.toContain("return;");
  });
});

// ═══════════════════════════════════════════════════════════════════
// StrictMergeWriter — hasConflict additional branches
//
// hasConflict checks: isAbstract, typeParameter count/content,
// property signature, and constructor parameter signature.
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict additional branches", () => {
  it("writes .ode.ts when isAbstract differs between generated and existing class", async () => {
    const project = makeProject({ "f.ts": "export abstract class Foo {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing is not abstract — isAbstract mismatch triggers conflict
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\nexport class Foo {}");

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
    expect(fs.existsSync(path.join(tmpDir, "f.ode.ts"))).toBe(true);
    // Original file is untouched
    const original = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(original).not.toContain("abstract");
  });

  it("writes .ode.ts when typeParameter count differs", async () => {
    const project = makeProject({ "f.ts": "export class Foo<T, U> {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing has one type parameter; generated has two
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo<T> {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });

  it("writes .ode.ts when typeParameter constraint changes", async () => {
    const project = makeProject({ "f.ts": "export class Foo<T extends string> {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Same count, different constraint
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo<T extends number> {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });

  it("writes .ode.ts when a property type differs (exercises propSignature)", async () => {
    const project = makeProject({
      "f.ts": 'export class Foo { readonly x: string = "a"; }',
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing has number type; generated has string type
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { readonly x: number = 1; }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });

  it("writes .ode.ts when constructor parameter types differ (exercises ctorParamSignature)", async () => {
    const project = makeProject({
      "f.ts": "export class Foo { constructor(x: string) {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing constructor takes number; generated takes string
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { constructor(x: number) {} }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });

  it("does not flag a conflict when the user added async to a generated method (async is excluded from methodSignature)", async () => {
    // Generated has a non-async execute; user added 'async' to it.
    // methodSignature strips 'async' via the .filter() callback (lines 486-487),
    // so both sides produce the same signature → no conflict.
    const project = makeProject({
      "f.ts": "export class Foo { execute(s: string): void { throw new Error(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { async execute(s: string): void { return; } }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    // async was excluded from both signatures → no conflict detected
    expect(result.conflicted).toBeUndefined();
    // File merged in-place (not renamed to .ode.ts)
    expect(fs.existsSync(path.join(tmpDir, "f.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "f.ode.ts"))).toBe(false);
  });

  it("does not flag a conflict when a generated method is absent from the existing class (new methods are not conflicts)", async () => {
    // hasConflict line 571: existingCls.getMethod(name) returns undefined → continue.
    const project = makeProject({
      "f.ts": "export class Foo { execute(s: string): void { throw new Error(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing class has no methods
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\nexport class Foo {}");

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBeUndefined();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("execute"); // added by merge
  });

  it("does not flag a conflict when the generated class has a constructor but the existing class does not", async () => {
    // hasConflict line 556 false branch: genCtors.length > 0, existingCtors.length = 0
    // → skip constructor check, no conflict.
    const project = makeProject({
      "f.ts": "export class Foo { constructor(readonly x: string) {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\nexport class Foo {}");

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBeUndefined();
  });

  it("does not flag a conflict when both classes have constructors with identical parameter types", async () => {
    // hasConflict lines 558-564: counts match, params match → loop completes without returning.
    const project = makeProject({
      "f.ts": "export class Foo { constructor(readonly x: string) {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { constructor(readonly x: string) {} }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBeUndefined();
  });

  it("writes .ode.ts when an import switches between type-only and value", async () => {
    // hasConflict line 605: existing import from same specifier has different isTypeOnly.
    // Generated wants a value import; existing has a type-only import → conflict.
    const project = makeProject({
      "f.ts": 'import { Foo } from "bar";\nexport class MyClass {}',
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      '/* @odetovibe-generated */\nimport type { Foo } from "bar";\nexport class MyClass {}',
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Post-merge compile errors
//
// After merging generated structure with user code, the merged result
// is type-checked before writing.  When the preserved user method body
// references an undeclared name, the merge produces TS2304 and the
// file is not written.
// ═══════════════════════════════════════════════════════════════════

describe("MergeWriter — post-merge compile errors", () => {
  it("returns compileErrors when the merged body references an undeclared name", async () => {
    // Generated updates the param type; existing body calls undeclaredFn.
    // mergeMethod preserves the body → merged text: execute(x: string): void { undeclaredFn(); }
    // checkDiagnostics catches TS2304 (not in FALLBACK_FILTERED_CODES).
    const project = makeProject({
      "f.ts": "export class Foo { execute(x: string): void { throw new Error(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { execute(x: number): void { undeclaredFn(); } }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
  });

  it("does not overwrite the existing file when merged content has compile errors", async () => {
    const project = makeProject({
      "f.ts": "export class Foo { execute(x: string): void { throw new Error(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    const originalContent =
      "/* @odetovibe-generated */\nexport class Foo { execute(x: number): void { undeclaredFn(); } }";
    fs.writeFileSync(path.join(tmpDir, "f.ts"), originalContent);

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    // Original content is preserved — merge aborted before writeFileSync
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("undeclaredFn");
  });
});

describe("StrictMergeWriter — post-merge compile errors", () => {
  it("returns compileErrors on the no-conflict path when merged body has an undeclared name", async () => {
    // Same method signature → hasConflict returns false → proceeds to merge.
    // Preserved body calls undeclaredFn → TS2304 after merge.
    const project = makeProject({
      "f.ts": "export class Foo { execute(x: string): void { throw new Error(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing has the same signature but an undeclared name in the body
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { execute(x: string): void { undeclaredFn(); } }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
    // No conflict was detected — this is the no-conflict merge path, not the .ode.ts path
    expect(result.conflicted).toBeUndefined();
  });

  it("returns compileErrors on the conflict path when generated content has an undeclared name", async () => {
    // Generated extends an undeclared base → different extends clause triggers conflict.
    // checkDiagnostics on the conflict altText finds TS2304 → .ode.ts is not written.
    const project = makeProject({ "f.ts": "export class Foo extends UndeclaredBase {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing has a different extends clause → hasConflict = true
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo extends Subject {}",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    // Conflict path was taken (path is .ode.ts) but compile errors prevented writing
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
    expect(result.created).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "f.ode.ts"))).toBe(false);
  });

  it("returns compileErrors without writing when the output file does not exist yet but generated code has errors", async () => {
    // StrictMergeWriter new-file path (line 692): !fs.existsSync → checkDiagnostics →
    // TS2304 (undeclaredFn, not in FALLBACK_FILTERED_CODES) → early return, file never created.
    const project = makeProject({
      "f.ts": "export class Foo { execute(): void { undeclaredFn(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // No existing file — strict new-file path is taken

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
    expect(result.created).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "f.ts"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// formatCode — Prettier error fallback
//
// formatCode catches Prettier errors and returns the original unformatted
// code.  Triggered when Prettier cannot infer a parser for the file
// extension (e.g. an unknown extension with no prettierrc in scope).
// ═══════════════════════════════════════════════════════════════════

describe("formatCode — Prettier error fallback", () => {
  it("writes the file with unformatted content when Prettier cannot infer a parser", async () => {
    // A single-line interface body that Prettier would expand to multi-line for .ts files.
    // For an unknown extension (.xyz) with no prettierrc in /tmp, Prettier throws →
    // formatCode catch returns the original code unchanged → single-line form is preserved.
    const body = "export interface Foo { name: string; }";
    const project = makeProject({ "f.xyz": body });
    const sf = project.getSourceFileOrThrow("f.xyz");
    const tmpDir = makeTmpDir();

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    expect(fs.existsSync(path.join(tmpDir, "f.xyz"))).toBe(true);
    const written = fs.readFileSync(path.join(tmpDir, "f.xyz"), "utf-8");
    // Prettier did not run — single-line form is intact (not expanded)
    expect(written).toContain("{ name: string; }");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MergeWriter — new method in existing class
//
// mergeClass adds generated methods that are absent from the existing
// class (line 401: existing.addMethod).  This is the path taken when
// a new Subject is added to a Command: re-generation produces a new
// visit method that the user's file does not yet have.
// ═══════════════════════════════════════════════════════════════════

describe("MergeWriter — new member added to existing class", () => {
  it("adds a generated method that is absent from the existing class", async () => {
    // Generated has two methods; existing only has the first.
    // mergeClass calls existing.addMethod() for the missing one (line 401).
    const project = makeProject({
      "f.ts":
        "export class Foo { a(): void { throw new Error(); } b(): void { throw new Error(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing file only has a() — b() is new in the generated version
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { a(): void { return; /* user impl */ } }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("b()"); // newly added via line 401
    expect(written).toContain("return; /* user impl */"); // a()'s body preserved
  });

  it("adds a generated property that is absent from the existing class", async () => {
    // mergeClass loops over generated properties; if the existing class does not
    // have one, it calls existing.addProperty() (line 385).
    const project = makeProject({
      "f.ts": 'export class Foo { readonly x = "a"; readonly y = "b"; }',
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing only has property x — y is new in the generated version
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      '/* @odetovibe-generated */\nexport class Foo { readonly x = "a"; }',
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("readonly y"); // newly added via line 385
    expect(written).toContain("readonly x"); // x preserved
  });
});

// ═══════════════════════════════════════════════════════════════════
// checkDiagnostics — FALLBACK_FILTERED_CODES TS2583 suppression
//
// When no tsconfig is found (temp dir), checkDiagnostics uses an
// isolated in-memory ES3 project.  ES2015+ globals like Set are
// absent from the ES3 lib → TypeScript emits TS2583.
// FALLBACK_FILTERED_CODES includes 2583 so this is suppressed.
// ═══════════════════════════════════════════════════════════════════

describe("checkDiagnostics — FALLBACK_FILTERED_CODES TS2583 suppression", () => {
  it("suppresses TS2583 (Cannot find name Set) so the file is written without compile errors", async () => {
    // Code uses Set — TS2583 in the isolated ES3 in-memory fallback checker.
    // FALLBACK_FILTERED_CODES includes 2583 → filtered → no compile errors.
    const project = makeProject({
      "f.ts": "export class Foo { execute(): Set<string> { return new Set<string>(); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    // TS2583 was produced but filtered — file written cleanly
    expect(result.compileErrors).toBeUndefined();
    expect(fs.existsSync(path.join(tmpDir, "f.ts"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// checkDiagnostics — tsconfig branch (lines 148-167)
//
// When findTsConfigPath finds a tsconfig.json walking up from the
// output path, checkDiagnostics uses a real-filesystem Project
// rather than the isolated in-memory fallback.  Triggered by writing
// a tsconfig.json into the temp dir before running writeFiles.
// ═══════════════════════════════════════════════════════════════════

describe("checkDiagnostics — tsconfig branch", () => {
  it("reports a compile error using the real tsconfig when one is found", async () => {
    // Place a tsconfig.json in the temp dir so findTsConfigPath finds it.
    // checkDiagnostics then creates a real Project with that config (lines 148-156),
    // adds the file (line 157), runs diagnostics (lines 160-168).
    // A type error in the code produces a diagnostic that passes the filter
    // and is mapped to a message string (lines 165-167).
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );

    const project = makeProject({ "f.ts": "const x: string = 123;" });
    const sf = project.getSourceFileOrThrow("f.ts");

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir));

    // Real type-check caught TS2322 ("Type 'number' is not assignable to type 'string'")
    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
    expect(result.compileErrors!.some((e) => e.includes("not assignable"))).toBe(true);
    // File was not written — compile gate aborted the write
    expect(result.created).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "f.ts"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MergeWriter — mergeFile anonymous class guard (line 431)
//
// mergeFile skips generated ClassDeclarations with no name via
// `if (!name) continue` at line 431.  The only way to produce an
// anonymous ClassDeclaration is `export default class {}`.
// ═══════════════════════════════════════════════════════════════════

describe("MergeWriter — mergeFile anonymous class guard", () => {
  it("skips an anonymous default-export class during merge (line 431 continue)", async () => {
    // export default class {} is a ClassDeclaration with getName() === undefined.
    // Line 431: if (!name) continue — the anonymous class is skipped entirely.
    const project = makeProject({ "f.ts": "export default class {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing file has a named class — skipping the generated anonymous class
    // must leave existing content intact.
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Bar { execute(): void { return; } }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("class Bar");
  });
});

// ═══════════════════════════════════════════════════════════════════
// MergeWriter — mergeFile new interface (lines 440-442)
//
// mergeFile adds a generated interface that is absent from the
// existing file via existing.addInterface() at line 442.
// ═══════════════════════════════════════════════════════════════════

describe("MergeWriter — mergeFile new interface", () => {
  it("adds a generated interface absent from the existing file (lines 440-442)", async () => {
    // mergeFile line 440: generated has interface Foo; existing.getInterface("Foo") = undefined.
    // Line 441: condition true → existing.addInterface(...) at line 442.
    const project = makeProject({ "f.ts": "export interface Foo { name: string; }" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\n");

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("interface Foo");
    expect(written).toContain("name: string");
  });
});

// ═══════════════════════════════════════════════════════════════════
// hasConflict — typeParameter loop body, line 531 false path
//
// When both classes have the same number and text of type parameters,
// the loop body at line 531 executes but the condition is false —
// the loop completes without returning, and conflict detection
// continues to later checks.
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict typeParam loop false path", () => {
  it("executes the type-parameter loop body without returning when texts match (line 531 false)", async () => {
    // Both classes have <T extends string> — same text → line 531 condition is false.
    // Loop completes; conflict is detected later from the method return type difference.
    const project = makeProject({
      "f.ts": "export class Foo<T extends string> { execute(): number { return 0; } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo<T extends string> { execute(): string { return ''; } }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    // Type-param loop found no conflict; method return type check did
    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// hasConflict — implements check (lines 534-541)
//
// Two scenarios:
//   - Conflict (line 540 true): same base name, different type args
//   - No conflict (line 540 false): existing has implements absent
//     from generated (genNorm is undefined)
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict implements check", () => {
  it("writes .ode.ts when an implements clause type argument changes (lines 534-541, line 540 true)", async () => {
    // MyTemplate<T> is defined in the file — no TS2304 in checkDiagnostics.
    // Generated implements MyTemplate<string>; existing implements MyTemplate<number>.
    // implBaseName("MyTemplate<string>") = implBaseName("MyTemplate<number>") = "MyTemplate".
    // genImplByBase has "MyTemplate" → "MyTemplate<string>".
    // Line 537 loop: text = "MyTemplate<number>", genNorm = "MyTemplate<string>" ≠ normalizeWs(text) → return true.
    const project = makeProject({
      "f.ts":
        "export interface MyTemplate<T> {}\nexport class Foo implements MyTemplate<string> { execute() {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport interface MyTemplate<T> {}\nexport class Foo implements MyTemplate<number> { execute() {} }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });

  it("does not flag a conflict when the user added an implements clause absent from generated (line 540 false, genNorm undefined)", async () => {
    // Generated class has no implements → genImplByBase = empty Map.
    // Existing class has implements UserInterface → genNorm = genImplByBase.get("UserInterface") = undefined.
    // Line 540: genNorm !== undefined → false → no conflict from implements.
    const project = makeProject({ "f.ts": "export class Foo { execute() {} }" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo implements UserInterface { execute() {} }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    // hasConflict returned false — user-added implements is not a conflict
    expect(result.conflicted).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// hasConflict — property not found → continue (line 547)
//
// When a generated property is absent from the existing class,
// hasConflict continues without flagging a conflict (line 547).
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict new property is not a conflict", () => {
  it("does not flag a conflict when a generated property is absent from the existing class (line 547 continue)", async () => {
    // Generated has x and y; existing only has x.
    // hasConflict line 546: existingCls.getProperty("y") = undefined.
    // Line 547: !existingProp → continue — y is skipped (not a conflict).
    const project = makeProject({
      "f.ts": 'export class Foo { readonly x = "a"; readonly y = "b"; }',
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      '/* @odetovibe-generated */\nexport class Foo { readonly x = "a"; }',
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBeUndefined();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("readonly y");
  });
});

// ═══════════════════════════════════════════════════════════════════
// hasConflict — constructor count mismatch (line 557)
//
// When both the generated and existing classes have constructors
// (line 556 is true), line 557 checks that the counts match.
// An existing class with overload signatures has more ConstructorDeclaration
// nodes than a generated class with a single implementation.
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict constructor count mismatch", () => {
  it("writes .ode.ts when existing has more constructors than generated (line 557)", async () => {
    // Generated: 1 ConstructorDeclaration. Existing: 2 (overload signature + implementation).
    // ts-morph getConstructors() returns all declarations including overload signatures.
    // Line 557: genCtors.length (1) !== existingCtors.length (2) → return true.
    const project = makeProject({
      "f.ts": "export class Foo { constructor(x: string) {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { constructor(x: string); constructor(x: string | number) {} }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// hasConflict — import check, line 605 false path (existingDecl undefined)
//
// Line 605: if (existingDecl && ...) — the false path is taken when
// no import from the generated specifier exists in the existing file.
// A new import in the generated output is not a conflict.
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict new import is not a conflict", () => {
  it("does not flag a conflict when generated has a new import absent from existing (line 605 false, existingDecl undefined)", async () => {
    // Generated imports { Cmd } from "somemod"; existing has no imports.
    // sameTypeOnly = undefined (no import from "somemod" in existing).
    // existingDecl = undefined (same search, less restrictive — still not found).
    // Line 605: if (undefined && ...) → false → no conflict for this import.
    const project = makeProject({
      "f.ts": 'import { Cmd } from "somemod";\nexport class Foo {}',
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, "f.ts"), "/* @odetovibe-generated */\nexport class Foo {}");

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// propSignature — no-initializer paths (lines 461 and 463)
//
// propSignature is called for both sides of a property comparison in
// hasConflict.  When a property has no initializer (only a type
// annotation), getInitializer() returns undefined:
//   line 461: ?? fallback path — init = ""
//   line 463: init = "" → ternary false arm — initPart = ""
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — propSignature no-initializer paths", () => {
  it("writes .ode.ts when property type changes and neither property has an initializer (lines 461 false path, 463 false arm)", async () => {
    // Both properties have type annotations but no initializers.
    // propSignature: getInitializer() = undefined → init = "" (line 461 ?? fallback).
    // Line 463: init = "" → initPart = "" (ternary false arm).
    // Signatures differ (string vs number) → conflict detected.
    const project = makeProject({
      "f.ts": "export class Foo { readonly x: string; }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { readonly x: number; }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// hasConflict — anonymous class guard (line 512)
//
// hasConflict skips generated ClassDeclarations with no name via
// `if (!name) continue` at line 512.  This is the parallel of
// mergeFile's line 431 guard, but exercised in strict mode.
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict anonymous class guard", () => {
  it("skips an anonymous default-export class in hasConflict and proceeds without conflict (line 512 continue)", async () => {
    // hasConflict(generatedText, existingContent) iterates generated.getClasses().
    // export default class {} → getName() = undefined → line 512: continue.
    // No named classes to compare → hasConflict returns false → merge runs.
    const project = makeProject({ "f.ts": "export default class {}" });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    // Existing file present — hasConflict is invoked
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Bar { execute(): void { return; } }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    // Anonymous class skipped in hasConflict; no conflict; Bar preserved in merged output
    expect(result.conflicted).toBeUndefined();
    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("class Bar");
  });
});

// ═══════════════════════════════════════════════════════════════════
// hasConflict — constructor count mismatch via dual-implementation
// class (line 557)
//
// ts-morph's getConstructors() returns every ConstructorDeclaration
// node, including syntactic duplicates.  When the existing class has
// two constructor declarations and generated has one, the count check
// at line 557 fires before the param-signature loop.
// ═══════════════════════════════════════════════════════════════════

describe("StrictMergeWriter — hasConflict constructor count mismatch (dual-impl)", () => {
  it("writes .ode.ts when existing has two constructor declarations but generated has one (line 557)", async () => {
    // Generated: 1 ConstructorDeclaration. Existing: 2 (two impl-style declarations,
    // syntactically valid — the TypeScript parser produces one node per constructor keyword).
    // genCtors.length (1) > 0 → line 554 true; existingCtors.length (2) > 0 → line 556 true.
    // Line 557: 1 !== 2 → return true.
    const project = makeProject({
      "f.ts": "export class Foo { constructor(x: string) {} }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo { constructor(x: string) {} constructor(x: number) {} }",
    );

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "strict"));

    expect(result.conflicted).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, "f.ode.ts"));
  });
});

describe("checkDiagnostics — DiagnosticMessageChain fallback (line 179)", () => {
  it("calls getMessageText() when diagnostic message is a DiagnosticMessageChain, not a plain string (line 179 false branch)", async () => {
    // TS2345 with a property-level sub-message produces a DiagnosticMessageChain object,
    // not a plain string. The false branch of `typeof msg === "string"` calls msg.getMessageText().
    const project = makeProject({
      "f.ts": 'function foo(x: { bar: number }): void {}\nfoo({ bar: "hello" });\n',
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();

    const result = await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "overwrite"));

    expect(result.compileErrors).toBeDefined();
    expect(result.compileErrors!.length).toBeGreaterThan(0);
    expect(typeof result.compileErrors![0]).toBe("string");
  });
});

describe("MergeWriter — mergeMethod ?? fallback when existing method is abstract (line 294)", () => {
  it("uses empty string for body when existing method has no body (abstract), merging in generated concrete body (line 294 ?? arm)", async () => {
    // Generated has concrete execute(); existing has abstract execute() — no body.
    // existing.getBodyText() returns undefined → ?? "" fires (line 294).
    const project = makeProject({
      "f.ts":
        'export class Foo { execute(x: string): void { throw new Error("Not implemented"); } }',
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport abstract class Foo { abstract execute(x: string): void; }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("execute");
    expect(written).not.toContain("abstract execute");
  });
});

describe("MergeWriter — mergeClass genImpl normalization when generated has no implements clause (lines 325-327)", () => {
  it("takes the [] path when genStruct.implements is undefined, preserving existing user-added implements (line 327)", async () => {
    // genStruct.implements = undefined → Array.isArray(undefined) = false → line 325
    // → undefined != null = false → line 327: genImpl = []
    // User-added implements on existing class is preserved via preservedImpl.
    const project = makeProject({
      "f.ts": "export class Foo { execute(): void { throw new Error(''); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nexport class Foo implements UserIface { execute(): void { return; } }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("UserIface");
    expect(written).toContain("execute");
  });
});

describe("MergeWriter — mergeClass extendsChanged true branch (line 372)", () => {
  it("updates extends clause when generated extends differs from existing extends (line 372 true branch)", async () => {
    // Generated: Foo extends Bar (Bar not declared in generated — just referenced).
    // Existing on disk: both Bar and Baz declared; Foo extends Baz.
    // After merge: mergeClass detects normalizeWs("Bar") !== normalizeWs("Baz")
    // → extendsChanged = true → line 372: { extends: "Bar" } → Foo.extends updated.
    // Bar remains declared before Foo in the merged output → valid TypeScript.
    const project = makeProject({
      "f.ts": "export class Foo extends Bar { execute(): void { throw new Error(''); } }",
    });
    const sf = project.getSourceFileOrThrow("f.ts");
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, "f.ts"),
      "/* @odetovibe-generated */\nclass Bar {}\nclass Baz {}\nexport class Foo extends Baz { execute(): void { return; } }",
    );

    await writeCmd.run(new SourceFileEntry(sf), ctx(tmpDir, "merge"));

    const written = fs.readFileSync(path.join(tmpDir, "f.ts"), "utf-8");
    expect(written).toContain("extends Bar");
    expect(written).not.toContain("extends Baz");
  });
});
