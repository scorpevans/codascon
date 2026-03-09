/* @odetovibe-generated */
/*
 * @codascon/odetovibe — Load Domain: Shared Types
 *
 * The Subject, object type, and return type for the Load phase.
 */

import { Subject } from "codascon";
import type { SourceFile } from "ts-morph";

/*
 * Wraps a ts-morph SourceFile for dispatch through `WriteFileCommand`.
 *
 * The SourceFile is already fully populated by the Transform phase.
 * `SourceFileEntry` is the single Subject in the Load domain — every
 * SourceFile in the Project passes through this entry type.
 */
/** Wraps a ts-morph `SourceFile` for dispatch through `WriteFileCommand`. */
export class SourceFileEntry extends Subject {
  readonly resolverName = "resolveSourceFile" as const;
  constructor(public readonly sourceFile: SourceFile) {
    super();
  }
}

/*
 * Controls how the writer Template handles existing files.
 *
 * - `"overwrite"` — Replace the file unconditionally (`--overwrite` flag).
 * - `"merge"`     — Reconcile generated structure with existing user code
 *                   (default, no flag).
 * - `"strict"`    — Merge only when all codegen-owned slots in the existing
 *                   file are free (absent or identical). On conflict, write
 *                   generated content to `$filename.ode.ts` instead
 *                   (`--no-overwrite` flag).
 */
/** File write mode: `"overwrite"` replaces unconditionally, `"merge"` reconciles, `"strict"` aborts to `.ode.ts` on conflict. */
export type WriteMode = "overwrite" | "merge" | "strict";

/*
 * Context passed to every writer Template.
 *
 * @property targetDir — Absolute path to the root output directory.
 *                       Files are written at `targetDir/<sourceFilePath>`.
 * @property mode      — Controls conflict handling; see `WriteMode`.
 */
/** Context passed to every writer Template — root output directory and write mode. */
export interface WriteContext {
  readonly targetDir: string;
  readonly mode: WriteMode;
}

/*
 * Result returned by every writer Template.
 *
 * @property path          — Absolute path of the file that was (or would
 *                           have been) written.
 * @property created       — `true` if the file did not exist before this
 *                           write; `false` if it already existed.
 *                           Always `false` when `compileErrors` is set.
 * @property conflicted    — `true` when strict mode detected a conflict and
 *                           wrote to `$filename.ode.ts` instead. Absent
 *                           (or `false`) when no conflict occurred.
 * @property compileErrors — Set when the final file text (after merge) has
 *                           TypeScript compile errors. The file is NOT
 *                           written when this is present. Each entry is a
 *                           diagnostic message string.
 */
/** Result of a write operation — output path, created/updated flag, optional conflict and compile-error details. */
export interface WriteResult {
  readonly path: string;
  readonly created: boolean;
  readonly conflicted?: boolean;
  readonly compileErrors?: string[];
}
