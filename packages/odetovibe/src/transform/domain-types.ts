/* @odetovibe-generated */
/*
 * @codascon/odetovibe — Transform Domain: Shared Types
 *
 * Context and result types for the transform phase.
 * Emitters receive an `EmitContext` and return an `EmitResult`.
 */

import type { Project } from "ts-morph";
import type { ConfigIndex } from "../extract/domain-types.js";

/*
 * Context passed to every emitter.
 *
 * `configIndex` enables cross-entry lookups — e.g., an AbstractTemplate
 * emitter looking up its parent Command's subjectUnion, or a Strategy
 * emitter looking up its parent Template's isParameterized flag.
 *
 * `project` is the ts-morph Project. Emitters call `project.getSourceFile`
 * or `project.createSourceFile` to obtain the SourceFile they write to,
 * then add declarations directly to it.
 */
/** Context passed to every emitter — provides the `ConfigIndex` for cross-entry lookups and the ts-morph `Project`. */
export interface EmitContext {
  readonly configIndex: ConfigIndex;
  readonly project: Project;
}

/*
 * Result returned by every emitter.
 *
 * `targetFile` is the path of the in-memory ts-morph SourceFile the emitter
 * added declarations to (e.g. `"domain-types.ts"` or
 * `"campus/commands/access-building.ts"`). No disk I/O occurs during emit —
 * declarations accumulate in the Project's in-memory file system.
 * The Load phase reads these paths from `project.getSourceFiles()` and
 * writes them to disk.
 */
/** Result returned by every emitter — the virtual path of the ts-morph SourceFile declarations were added to. */
export interface EmitResult {
  readonly targetFile: string;
}
