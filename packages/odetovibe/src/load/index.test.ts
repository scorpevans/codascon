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

  // ── prettier ──────────────────────────────────────────────────────

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
