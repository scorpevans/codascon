/*
 * @codascon/odetovibe — Transform Domain: Public API
 *
 * Exposes `emitAst(configIndex, ctx)` — iterates all entries in a
 * validated `ConfigIndex` and dispatches each to its emitter via
 * `EmitAstCommand`. Emitters add TypeScript declarations directly to
 * SourceFiles in `ctx.project`.
 *
 * Typical usage:
 * ```ts
 * import { Project } from "ts-morph";
 * import { parseYaml, validateYaml } from "./extract/index.js";
 * import { emitAst } from "./transform/index.js";
 *
 * const configIndex = parseYaml("schema.yaml");
 * const { valid } = validateYaml(configIndex);
 * if (!valid) throw new Error("Invalid schema");
 *
 * const project = new Project({ useInMemoryFileSystem: true });
 * emitAst(configIndex, { configIndex, project });
 * // project now contains populated SourceFiles ready for the Load phase
 * ```
 */

import type { ConfigIndex } from "../extract/domain-types.js";
import type { EmitContext, EmitResult } from "./domain-types.js";
import { EmitAstCommand } from "./commands/emit-ast.js";

export { EmitAstCommand } from "./commands/emit-ast.js";
export type { EmitContext, EmitResult } from "./domain-types.js";

const emitCmd = new EmitAstCommand();

/*
 * Emits TypeScript AST for all entries in a `ConfigIndex`.
 *
 * Iterates all 5 entry maps in dependency order (types → commands →
 * templates → strategies) and dispatches each entry through
 * `EmitAstCommand`. Emitters add declarations to SourceFiles in
 * `ctx.project` — no files are written to disk by this function.
 *
 * @param configIndex — The parsed and validated config index.
 * @param ctx — Emit context with the ts-morph `Project` and the
 *              `configIndex` for cross-entry lookups.
 * @returns Array of `EmitResult`, one per entry, in iteration order.
 */
/** Emit TypeScript AST for all entries in a `ConfigIndex` into `ctx.project`. No disk I/O. */
export function emitAst(configIndex: ConfigIndex, ctx: EmitContext): EmitResult[] {
  const results: EmitResult[] = [];

  for (const entry of configIndex.subjectTypes.values()) {
    results.push(emitCmd.run(entry, ctx));
  }
  for (const entry of configIndex.plainTypes.values()) {
    results.push(emitCmd.run(entry, ctx));
  }
  for (const tplEntry of configIndex.abstractTemplates.values()) {
    results.push(emitCmd.run(tplEntry, ctx));
    for (const stratEntry of configIndex.strategies.values()) {
      if (
        stratEntry.commandKey === tplEntry.commandKey &&
        stratEntry.templateKey === tplEntry.key
      ) {
        results.push(emitCmd.run(stratEntry, ctx));
      }
    }
  }
  for (const entry of configIndex.commands.values()) {
    results.push(emitCmd.run(entry, ctx));
  }

  return results;
}
