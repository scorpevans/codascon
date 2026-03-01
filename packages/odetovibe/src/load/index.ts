/**
 * @codascon/odetovibe — Load Domain: Public API
 *
 * Exposes `writeFiles(project, context)` — iterates all SourceFiles in
 * a ts-morph Project and dispatches each through `WriteFileCommand`.
 * Each SourceFile is written to `context.targetDir/<filePath>`.
 *
 * Typical usage:
 * ```ts
 * import { Project } from "ts-morph";
 * import { parseYaml, validateYaml } from "./extract/index.js";
 * import { emitAst } from "./transform/index.js";
 * import { writeFiles } from "./load/index.js";
 *
 * const configIndex = parseYaml("schema.yaml");
 * const { valid } = validateYaml(configIndex);
 * if (!valid) throw new Error("Invalid schema");
 *
 * const project = new Project({ useInMemoryFileSystem: true });
 * emitAst(configIndex, { configIndex, project });
 * const results = await writeFiles(project, { targetDir: "./generated", mode: "merge" });
 * for (const r of results) {
 *   if (r.conflicted) console.warn("conflict", r.path);
 *   else console.log(r.created ? "created" : "updated", r.path);
 * }
 * ```
 *
 * @module odetovibe/load
 */

import type { Project } from "ts-morph";
import { SourceFileEntry } from "./domain-types.js";
import type { WriteContext, WriteResult } from "./domain-types.js";
import { WriteFileCommand } from "./commands/write-file.js";

export { WriteFileCommand } from "./commands/write-file.js";
export { SourceFileEntry } from "./domain-types.js";
export type { WriteContext, WriteResult, WriteMode } from "./domain-types.js";

const writeCmd = new WriteFileCommand();

/**
 * Writes all SourceFiles in a ts-morph Project to disk.
 *
 * Each SourceFile's virtual path is resolved relative to `context.targetDir`.
 * Parent directories are created as needed. A `/* @odetovibe-generated *\/`
 * header is prepended to every file. Generated text is formatted with Prettier
 * before writing; only codegen-contributed content is formatted.
 *
 * @param project — The ts-morph Project produced by the Transform phase.
 * @param context — Write context: target directory and write mode.
 * @returns Promise resolving to an array of `WriteResult`, one per SourceFile.
 */
export async function writeFiles(project: Project, context: WriteContext): Promise<WriteResult[]> {
  return Promise.all(
    project.getSourceFiles().map((sf) => writeCmd.run(new SourceFileEntry(sf), context)),
  );
}
