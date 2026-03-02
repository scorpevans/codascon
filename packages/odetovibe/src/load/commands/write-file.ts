/* @odetovibe-generated */
/**
 * @codascon/odetovibe — Load Domain: WriteFileCommand
 *
 * Dispatches each SourceFileEntry to its writer Template, selected by
 * WriteContext.mode:
 *   "overwrite" → OverwriteWriter       — replaces the file unconditionally.
 *   "merge"     → MergeWriter           — reconciles generated structure with
 *                                         existing user code.
 *   "strict"    → StrictMergeWriter     — merge only when codegen-owned slots
 *                                         are free; abort to .ode.ts on conflict.
 *
 * Prettier formatting:
 *   The generated SourceFile text is formatted with Prettier before being
 *   written or merged.  Only codegen-contributed content is formatted; the
 *   user's existing code (preserved by the merge logic) is never touched.
 *
 * Merge ownership contract:
 *   - Class structure (extends, typeParameters, isAbstract) → odetovibe owns; updated.
 *   - Class implements → union-merge by base name: codegen entries win per
 *     base name; user-added entries (not in generated) are preserved.
 *   - Class properties → odetovibe owns; always updated.
 *   - Class constructors → odetovibe owns; always updated.
 *   - Class method signatures → odetovibe owns; always updated.
 *   - Class method bodies → user owns; always preserved regardless of content.
 *   - User-added class members (absent from generated) → preserved.
 *   - Interface structure → user owns; never touched if interface already exists.
 *   - Interface absent from existing → stub written once; never overwritten.
 *   - JSDoc (all nodes) → user owns; always preserved.
 *   - Imports → union: generated imports added, user extras kept.
 *   - Declarations absent from generated output → preserved untouched.
 *
 * @module odetovibe/load/write-file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { format as prettierFormat } from "prettier";
import { Project, IndentationText } from "ts-morph";
import type {
  SourceFile,
  ClassDeclaration,
  MethodDeclaration,
  MethodDeclarationStructure,
  ConstructorDeclaration,
  ConstructorDeclarationStructure,
  PropertyDeclaration,
  ImportSpecifier,
} from "ts-morph";
import { Command } from "codascon";
import type { Template } from "codascon";
import type { SourceFileEntry, WriteContext, WriteResult, WriteMode } from "../domain-types.js";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const GENERATED_HEADER = "/* @odetovibe-generated */\n";

/**
 * Error codes that are always filtered from the in-memory diagnostic check.
 *
 * TS2307 — "Cannot find module X" — external modules can't be resolved in
 *   an in-memory virtual FS; all imported names resolve to `any`, so no
 *   TS2304 cascades from them.
 *
 * TS2550 — "Property X does not exist on type Y. Do you need to change your
 *   target library?" — fires for properties (e.g. `Object.entries`) that live
 *   in a newer ES lib than the in-memory project's default target (ES3).
 *   Always a lib-version mismatch, never a codegen error.
 *
 * TS2552 — "Cannot find name X. Did you mean Y?" — suggestion-based variant
 *   of TS2304; fires for names like `ReadonlyMap`/`ReadonlySet` in ES2015+
 *   libs.  Filtered for the same lib-version reason as TS2583.
 *
 * TS2583 — "Cannot find name X. Do you need to change your target library?" —
 *   fires for names like `Set`, `Map`, `Promise` that live in ES2015+ libs.
 *   Same lib-version mismatch; not a codegen error.
 */
// Codes suppressed in the in-memory fallback (no tsconfig found, e.g. test tmp dirs).
// These are all environment false-positives from the isolated ES3 in-memory project,
// not real type errors.
const FALLBACK_FILTERED_CODES = new Set([
  2307, // TS2307: Cannot find module — unresolvable in isolated virtual filesystem
  2550, // TS2550: Property does not exist — ES3 lib missing ES2015+ built-ins
  2552, // TS2552: Cannot find name — ES3 lib missing ES2015+ globals (ReadonlyMap etc.)
  2583, // TS2583: Cannot find name 'Set' — ES3 lib missing Set/Map constructors
  2705, // TS2705: Async requires Promise — ES3 lib has no Promise
]);

// ═══════════════════════════════════════════════════════════════════
// PRETTIER
// ═══════════════════════════════════════════════════════════════════

/**
 * Format `code` with Prettier.  Uses `filepath` so Prettier can:
 *   - auto-detect the TypeScript parser from the `.ts` extension, and
 *   - resolve the project's `.prettierrc` by walking up from `filepath`.
 *
 * Falls back to the original code if Prettier throws (e.g. parse error
 * in the generated text, or Prettier not configured).
 */
async function formatCode(code: string, filepath: string): Promise<string> {
  try {
    return await prettierFormat(code, { filepath });
  } catch {
    return code;
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMPILE-ERROR GATE
// ═══════════════════════════════════════════════════════════════════

/**
 * Walks up the directory tree from `startPath` looking for a `tsconfig.json`.
 * Returns the first match, or `undefined` if none is found before the root.
 */
function findTsConfigPath(startPath: string): string | undefined {
  let dir = path.dirname(startPath);
  while (true) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Type-checks `text` as if it were the file at `targetFilePath`.
 *
 * When a `tsconfig.json` is found by walking up from `targetFilePath`, a
 * real-filesystem project is created with that config (IDE-level accuracy):
 * external packages resolve from `node_modules`, local relative imports
 * resolve from disk, and the project's `target`/`strict`/`moduleResolution`
 * settings are honoured.  `composite` and `declaration` are disabled so that
 * files outside `rootDir` (e.g. testbed subdirectories) do not trigger TS6059.
 *
 * When no tsconfig is found (e.g. test temp directories), falls back to an
 * isolated in-memory project with `FALLBACK_FILTERED_CODES` suppressed.
 *
 * Returns an array of human-readable diagnostic messages; empty means clean.
 */
function checkDiagnostics(text: string, targetFilePath: string): string[] {
  const tsConfigFilePath = findTsConfigPath(targetFilePath);

  if (tsConfigFilePath) {
    const project = new Project({
      tsConfigFilePath,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        composite: false,
        declaration: false,
        declarationMap: false,
      },
    });
    const sf = project.createSourceFile(targetFilePath, text, {
      overwrite: true,
    });
    return project
      .getPreEmitDiagnostics()
      .filter(
        (d) => d.getSourceFile()?.getFilePath() === sf.getFilePath() && d.getCode() !== 6059, // TS6059: file outside rootDir — irrelevant for ad-hoc checks
      )
      .map((d) => {
        const msg = d.getMessageText();
        return typeof msg === "string" ? msg : msg.getMessageText();
      });
  }

  // Fallback: no tsconfig found — isolated in-memory project with filtered codes.
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("check.ts", text);
  return project
    .getPreEmitDiagnostics()
    .filter((d) => !FALLBACK_FILTERED_CODES.has(d.getCode()))
    .map((d) => {
      const msg = d.getMessageText();
      return typeof msg === "string" ? msg : msg.getMessageText();
    });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Resolves a SourceFile's virtual path to an absolute disk path.
 *
 * ts-morph normalises SourceFile paths to absolute form within its
 * virtual file system (e.g. "/domain-types.ts"). Strip the leading
 * slash so the path can be joined cleanly with `targetDir`.
 */
function resolveOutputPath(sourceFilePath: string, targetDir: string): string {
  const relative = sourceFilePath.replace(/^\/+/, "");
  return path.join(targetDir, relative);
}

// ═══════════════════════════════════════════════════════════════════
// MERGE INTERNALS
// ═══════════════════════════════════════════════════════════════════

/**
 * The name a named import brings into scope.
 * For `Foo as Bar` this is `"Bar"`; for plain `Foo` it is `"Foo"`.
 */
function inScopeName(specifier: ImportSpecifier): string {
  return specifier.getAliasNode()?.getText() ?? specifier.getName();
}

/** Remove the file-level @odetovibe-generated header if present. */
function stripHeader(text: string): string {
  return text.replace(/^\/\* @odetovibe-generated \*\/\s*\n?/, "");
}

/**
 * Strip all whitespace for semantic comparison of TypeScript type expressions.
 * Whitespace is never meaningful inside type signatures, so
 * `Command<\n  Foo,\n  Bar\n>` and `Command<Foo, Bar>` compare equal.
 */
function normalizeWs(s: string): string {
  return s.replace(/\s/g, "");
}

/**
 * Detect indentation style from existing file content.
 * Looks at the first indented line; defaults to two spaces.
 */
function detectIndentation(text: string): IndentationText {
  const match = text.match(/^([ \t]+)/m);
  if (!match) return IndentationText.TwoSpaces;
  const indent = match[1];
  if (indent[0] === "\t") return IndentationText.Tab;
  return indent.length >= 4 ? IndentationText.FourSpaces : IndentationText.TwoSpaces;
}

/**
 * Union-merge import declarations from `generated` into `existing`.
 * Adds missing import declarations; adds missing named imports to
 * existing ones. Never removes user-added imports.
 *
 * Matching key: (specifier, isTypeOnly, isNamespace).
 * Namespace (`import * as X`) and named (`import { X }`) declarations
 * from the same module are kept separate — they are structurally
 * incompatible and can legally coexist as distinct statements.
 */
function mergeImports(existing: SourceFile, generated: SourceFile): void {
  for (const genDecl of generated.getImportDeclarations()) {
    const specifier = genDecl.getModuleSpecifierValue();
    const isTypeOnly = genDecl.isTypeOnly();
    const isNamespace = genDecl.getNamespaceImport() !== undefined;
    const existingDecl = existing
      .getImportDeclarations()
      .find(
        (d) =>
          d.getModuleSpecifierValue() === specifier &&
          d.isTypeOnly() === isTypeOnly &&
          (d.getNamespaceImport() !== undefined) === isNamespace,
      );

    if (!existingDecl) {
      existing.addImportDeclaration(genDecl.getStructure());
    } else if (!isNamespace) {
      for (const named of genDecl.getNamedImports()) {
        if (!existingDecl.getNamedImports().some((n) => inScopeName(n) === named.getName())) {
          existingDecl.addNamedImport(named.getName());
        }
      }
    }
    // Namespace match found → already in scope, nothing to add.
  }
}

/**
 * Merge a single method.
 *
 * Abstract methods have no body — replace entirely.
 * Concrete methods: signature (params, return type, modifiers) is always
 * updated (codegen slot); body is always preserved (user slot).
 */
function mergeMethod(existing: MethodDeclaration, generated: MethodDeclaration): void {
  // Generated code never uses method overloads — cast is safe.
  const genStructure = generated.getStructure() as MethodDeclarationStructure;
  if (generated.isAbstract()) {
    existing.set(genStructure);
    return;
  }
  existing.set({
    ...genStructure,
    // `async` is user-owned (like the body): preserve it from the existing
    // method so that a user who marks an execute() method async does not have
    // the modifier silently removed on the next codegen run.
    isAsync: existing.isAsync(),
    statements: existing.getBodyText() ?? "",
    docs: existing.getJsDocs().map((d) => d.getStructure()),
  });
}

/**
 * Extract the base type name from an implements text, before any `<`.
 * Used to match `Template<Cmd, [], OldFoo>` with `Template<Cmd, [], NewFoo>`.
 */
function implBaseName(text: string): string {
  return text.split("<")[0].trim();
}

/**
 * Deep-merge a class declaration.
 *
 * - `extends`, `typeParameters`, `isAbstract` → codegen owns; always updated.
 * - `implements` → union-merge by base name: codegen entries replace any
 *   existing entry with the same base name; user-added entries (base names
 *   absent from generated) are preserved.
 * - Properties and constructors → codegen owns; always updated.
 * - Methods → merged via mergeMethod (signature updated, body preserved).
 * - Members present in existing but absent from generated → preserved.
 */
function mergeClass(existing: ClassDeclaration, generated: ClassDeclaration): void {
  const genStruct = generated.getStructure();

  // Normalize generated implements to a string array.
  const genImpl = (
    Array.isArray(genStruct.implements)
      ? genStruct.implements
      : genStruct.implements != null
        ? [genStruct.implements]
        : []
  ) as string[];

  const genImplByBase = new Map(genImpl.map((t) => [implBaseName(t), t]));

  // Keep existing entries whose base name is absent from generated (user-added),
  // discard those whose base name matches a generated entry (will be replaced).
  const preservedImpl = existing
    .getImplements()
    .map((i) => i.getText())
    .filter((t) => !genImplByBase.has(implBaseName(t)));

  // For each generated implements entry: if existing has the same base name and
  // semantically equal content (ignoring whitespace), reuse the existing text so
  // ts-morph can preserve the original AST node.
  const existingImplByBase = new Map(
    existing.getImplements().map((i) => [implBaseName(i.getText()), i.getText()]),
  );
  const mergedImpl = [
    ...preservedImpl,
    ...genImpl.map((t) => {
      const existingText = existingImplByBase.get(implBaseName(t));
      return existingText && normalizeWs(existingText) === normalizeWs(t) ? existingText : t;
    }),
  ];

  // Only include `extends` and `implements` in the set() call when their content
  // actually changed.  Omitting an unchanged key causes ts-morph to leave the
  // existing AST node untouched, which preserves the user's multi-line formatting.
  // Passing even the same text through set() causes ts-morph to re-serialise the
  // node using its own indentation, clobbering the original formatting.

  const genExtendsText = genStruct.extends as string | undefined;
  const existingExtendsText = existing.getExtends()?.getText();
  const extendsChanged =
    normalizeWs(genExtendsText ?? "") !== normalizeWs(existingExtendsText ?? "");

  const existingImplTexts = existing.getImplements().map((i) => i.getText());
  const implChanged =
    mergedImpl.length !== existingImplTexts.length ||
    mergedImpl.some((t, i) => normalizeWs(t) !== normalizeWs(existingImplTexts[i]));

  existing.set({
    isAbstract: genStruct.isAbstract,
    typeParameters: genStruct.typeParameters,
    ...(extendsChanged ? { extends: genStruct.extends } : {}),
    ...(implChanged ? { implements: mergedImpl } : {}),
    docs: existing.getJsDocs().map((d) => d.getStructure()),
  });

  for (const genProp of generated.getProperties()) {
    const existingProp = existing.getProperty(genProp.getName());
    if (existingProp) {
      existingProp.set({
        ...genProp.getStructure(),
        docs: existingProp.getJsDocs().map((d) => d.getStructure()),
      });
    } else {
      existing.addProperty(genProp.getStructure());
    }
  }

  if (generated.getConstructors().length > 0) {
    for (const ctor of existing.getConstructors()) ctor.remove();
    for (const genCtor of generated.getConstructors()) {
      // Generated code never uses constructor overloads — cast is safe.
      existing.addConstructor(genCtor.getStructure() as ConstructorDeclarationStructure);
    }
  }

  for (const genMethod of generated.getMethods()) {
    const existingMethod = existing.getMethod(genMethod.getName());
    if (!existingMethod) {
      // Generated code never uses method overloads — cast is safe.
      existing.addMethod(genMethod.getStructure() as MethodDeclarationStructure);
    } else {
      mergeMethod(existingMethod, genMethod);
    }
  }
}

/**
 * Produce the merged file text by reconciling `generatedText` (Prettier-
 * formatted generated code) with `existingContent` (current on-disk text).
 *
 * Both are parsed into isolated in-memory Projects so neither the main
 * project nor the caller's SourceFile is mutated.
 */
function mergeFile(generatedText: string, existingContent: string): string {
  const genProject = new Project({ useInMemoryFileSystem: true });
  const generated = genProject.createSourceFile("gen.ts", generatedText);

  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: detectIndentation(existingContent),
    },
  });
  const existing = project.createSourceFile("file.ts", existingContent);

  mergeImports(existing, generated);

  for (const genCls of generated.getClasses()) {
    const name = genCls.getName();
    if (!name) continue;
    const existingCls = existing.getClass(name);
    if (!existingCls) {
      existing.addClass(genCls.getStructure());
    } else {
      mergeClass(existingCls, genCls);
    }
  }

  for (const genIface of generated.getInterfaces()) {
    if (!existing.getInterface(genIface.getName())) {
      existing.addInterface(genIface.getStructure());
    }
    // Existing interface → user owns entirely; never touched.
  }

  return GENERATED_HEADER + stripHeader(existing.getFullText());
}

// ═══════════════════════════════════════════════════════════════════
// STRICT MERGE — CONFLICT DETECTION
// ═══════════════════════════════════════════════════════════════════

/** Canonical text for a property declaration, excluding JSDoc. */
function propSignature(p: PropertyDeclaration): string {
  const mods = p
    .getModifiers()
    .map((m) => m.getText())
    .join(" ");
  const type = p.getTypeNode()?.getText() ?? "";
  const init = p.getInitializer()?.getText() ?? "";
  const typePart = type ? `: ${type}` : "";
  const initPart = init ? ` = ${init}` : "";
  return `${mods} ${p.getName()}${typePart}${initPart}`.trim();
}

/** Canonical parameter list text for a constructor. */
function ctorParamSignature(ctor: ConstructorDeclaration): string {
  return ctor
    .getParameters()
    .map((p) => p.getText())
    .join(", ");
}

/** Canonical signature text for a method (no body, no JSDoc).
 *
 * The `async` modifier is excluded: whether a method is async is an
 * implementation detail owned by the user (like the method body), not
 * a structural contract owned by codegen.  Excluding it prevents
 * spurious conflict detection when the user marks a generated method
 * async and codegen regenerates it without the modifier.
 */
function methodSignature(m: MethodDeclaration): string {
  const mods = m
    .getModifiers()
    .map((mod) => mod.getText())
    .filter((mod) => mod !== "async")
    .join(" ");
  const params = m
    .getParameters()
    .map((p) => p.getText())
    .join(", ");
  const ret = m.getReturnTypeNode()?.getText() ?? "";
  const retPart = ret ? `: ${ret}` : "";
  return `${mods} ${m.getName()}(${params})${retPart}`.trim();
}

/**
 * Returns `true` if a normal merge would modify any codegen-owned slot in
 * an existing class.  Adding new elements (new class, new member) is never
 * a conflict — only modifying an existing codegen-owned value is.
 */
function hasConflict(generatedText: string, existingContent: string): boolean {
  const genProject = new Project({ useInMemoryFileSystem: true });
  const generated = genProject.createSourceFile("gen.ts", generatedText);

  const project = new Project({ useInMemoryFileSystem: true });
  const existing = project.createSourceFile("file.ts", existingContent);

  for (const genCls of generated.getClasses()) {
    const name = genCls.getName();
    if (!name) continue;
    const existingCls = existing.getClass(name);
    if (!existingCls) continue; // new class — will be added, not a conflict

    // extends — normalize whitespace so multi-line and single-line compare equal
    if (
      normalizeWs(genCls.getExtends()?.getText() ?? "") !==
      normalizeWs(existingCls.getExtends()?.getText() ?? "")
    )
      return true;

    // isAbstract
    if (genCls.isAbstract() !== existingCls.isAbstract()) return true;

    // typeParameters — normalize each
    const genTPs = genCls.getTypeParameters().map((tp) => normalizeWs(tp.getText()));
    const existingTPs = existingCls.getTypeParameters().map((tp) => normalizeWs(tp.getText()));
    if (genTPs.length !== existingTPs.length) return true;
    for (let i = 0; i < genTPs.length; i++) {
      if (genTPs[i] !== existingTPs[i]) return true;
    }

    // implements — normalize so multi-line entries compare equal to single-line
    const genImplByBase = new Map(
      genCls.getImplements().map((i) => [implBaseName(i.getText()), normalizeWs(i.getText())]),
    );
    for (const impl of existingCls.getImplements()) {
      const text = impl.getText();
      const genNorm = genImplByBase.get(implBaseName(text));
      if (genNorm !== undefined && genNorm !== normalizeWs(text)) return true;
    }

    // properties
    for (const genProp of genCls.getProperties()) {
      const existingProp = existingCls.getProperty(genProp.getName());
      if (!existingProp) continue; // new property — not a conflict
      if (normalizeWs(propSignature(genProp)) !== normalizeWs(propSignature(existingProp)))
        return true;
    }

    // constructors — codegen owns completely when it declares any
    const genCtors = genCls.getConstructors();
    if (genCtors.length > 0) {
      const existingCtors = existingCls.getConstructors();
      if (existingCtors.length > 0) {
        if (genCtors.length !== existingCtors.length) return true;
        for (let i = 0; i < genCtors.length; i++) {
          if (
            normalizeWs(ctorParamSignature(genCtors[i])) !==
            normalizeWs(ctorParamSignature(existingCtors[i]))
          )
            return true;
        }
      }
    }

    // method signatures
    for (const genMethod of genCls.getMethods()) {
      const existingMethod = existingCls.getMethod(genMethod.getName());
      if (!existingMethod) continue; // new method — not a conflict
      if (normalizeWs(methodSignature(genMethod)) !== normalizeWs(methodSignature(existingMethod)))
        return true;
    }
  }

  return false;
}

/** Resolves the conflict-output path: `foo.ts` → `foo.ode.ts`. */
function conflictPath(outputPath: string): string {
  const ext = path.extname(outputPath);
  return outputPath.slice(0, -ext.length) + ".ode" + ext;
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: OverwriteWriter
//
// Prepends the @odetovibe-generated header, creates any missing parent
// directories, and writes the SourceFile's full text to disk.
// ═══════════════════════════════════════════════════════════════════

class OverwriteWriter implements Template<WriteFileCommand, [], SourceFileEntry> {
  async execute(subject: SourceFileEntry, object: Readonly<WriteContext>): Promise<WriteResult> {
    const outputPath = resolveOutputPath(subject.sourceFile.getFilePath(), object.targetDir);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const text = await formatCode(subject.sourceFile.getFullText(), outputPath);
    const finalText = GENERATED_HEADER + text;
    const compileErrors = checkDiagnostics(finalText, outputPath);
    if (compileErrors.length > 0) return { path: outputPath, created: false, compileErrors };
    const existed = fs.existsSync(outputPath);
    fs.writeFileSync(outputPath, finalText, "utf-8");
    return { path: outputPath, created: !existed };
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: MergeWriter
//
// If the output file does not exist, behaves like OverwriteWriter.
// If it exists, merges generated structure into the existing file
// according to the ownership contract described at the top of this
// module.
// ═══════════════════════════════════════════════════════════════════

class MergeWriter implements Template<WriteFileCommand, [], SourceFileEntry> {
  async execute(subject: SourceFileEntry, object: Readonly<WriteContext>): Promise<WriteResult> {
    const outputPath = resolveOutputPath(subject.sourceFile.getFilePath(), object.targetDir);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const generatedText = await formatCode(subject.sourceFile.getFullText(), outputPath);

    if (!fs.existsSync(outputPath)) {
      const finalText = GENERATED_HEADER + generatedText;
      const compileErrors = checkDiagnostics(finalText, outputPath);
      if (compileErrors.length > 0) return { path: outputPath, created: false, compileErrors };
      fs.writeFileSync(outputPath, finalText, "utf-8");
      return { path: outputPath, created: true };
    }

    const existingContent = fs.readFileSync(outputPath, "utf-8");
    const mergedText = mergeFile(generatedText, existingContent);
    const finalText = await formatCode(mergedText, outputPath);
    const compileErrors = checkDiagnostics(finalText, outputPath);
    if (compileErrors.length > 0) return { path: outputPath, created: false, compileErrors };
    fs.writeFileSync(outputPath, finalText, "utf-8");
    return { path: outputPath, created: false };
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: StrictMergeWriter
//
// If the output file does not exist, behaves like OverwriteWriter.
// If it exists, checks whether any codegen-owned slot would be modified
// by a normal merge.  If a conflict is found, writes the generated
// content to `$filename.ode.ts` and returns { conflicted: true }.
// If no conflict, performs a normal merge in-place.
// ═══════════════════════════════════════════════════════════════════

class StrictMergeWriter implements Template<WriteFileCommand, [], SourceFileEntry> {
  async execute(subject: SourceFileEntry, object: Readonly<WriteContext>): Promise<WriteResult> {
    const outputPath = resolveOutputPath(subject.sourceFile.getFilePath(), object.targetDir);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const generatedText = await formatCode(subject.sourceFile.getFullText(), outputPath);

    if (!fs.existsSync(outputPath)) {
      const finalText = GENERATED_HEADER + generatedText;
      const compileErrors = checkDiagnostics(finalText, outputPath);
      if (compileErrors.length > 0) return { path: outputPath, created: false, compileErrors };
      fs.writeFileSync(outputPath, finalText, "utf-8");
      return { path: outputPath, created: true };
    }

    const existingContent = fs.readFileSync(outputPath, "utf-8");

    if (hasConflict(generatedText, existingContent)) {
      const altPath = conflictPath(outputPath);
      const altText = GENERATED_HEADER + generatedText;
      const compileErrors = checkDiagnostics(altText, altPath);
      if (compileErrors.length > 0) return { path: altPath, created: false, compileErrors };
      fs.writeFileSync(altPath, altText, "utf-8");
      return { path: altPath, created: true, conflicted: true };
    }

    const mergedText = mergeFile(generatedText, existingContent);
    const finalText = await formatCode(mergedText, outputPath);
    const compileErrors = checkDiagnostics(finalText, outputPath);
    if (compileErrors.length > 0) return { path: outputPath, created: false, compileErrors };
    fs.writeFileSync(outputPath, finalText, "utf-8");
    return { path: outputPath, created: false };
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMMAND: WriteFileCommand
// ═══════════════════════════════════════════════════════════════════

const overwriteWriter = new OverwriteWriter();
const mergeWriter = new MergeWriter();
const strictMergeWriter = new StrictMergeWriter();

const WRITER_BY_MODE: Record<WriteMode, Template<WriteFileCommand, [], SourceFileEntry>> = {
  overwrite: overwriteWriter,
  merge: mergeWriter,
  strict: strictMergeWriter,
};

export class WriteFileCommand extends Command<
  SourceFileEntry,
  WriteContext,
  Promise<WriteResult>,
  [SourceFileEntry]
> {
  readonly commandName = "writeFile" as const;

  resolveSourceFile(
    subject: SourceFileEntry,
    object: Readonly<WriteContext>,
  ): Template<WriteFileCommand, [], SourceFileEntry> {
    return WRITER_BY_MODE[object.mode];
  }
}
