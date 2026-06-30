import type { Command, SubjectRef } from "./schema.js";

/*
 * Subject-union derivation for a Command.
 *
 * `subjectUnion` was removed from the schema: a Command's subject union is now
 * derived as its `resolvers` keys (the resolved half, BRS) together with
 * `defaultSubjects` (the defaulted half, BDS). The two halves are kept separate —
 * `resolvers` keys generate per-subject resolver methods, `defaultSubjects` route
 * to `defaultResolver`. Each half is sorted alphabetically so generated output is
 * deterministic and independent of YAML authoring order.
 */

/** A Command's subject union, partitioned into resolved/defaulted halves (each sorted). */
export interface CommandSubjects {
  /** Resolved Subjects — the `resolvers` keys (BRS), sorted alphabetically. */
  resolved: SubjectRef[];
  /** Defaulted Subjects — `defaultSubjects` (BDS), sorted alphabetically. */
  defaulted: SubjectRef[];
  /** Full subject union — `resolved` ∪ `defaulted`, sorted alphabetically. */
  all: SubjectRef[];
}

// Deterministic, locale-independent order by UTF-16 code unit (correct for ASCII
// TypeScript identifiers). Avoids `localeCompare`, whose result can vary by locale.
const byName = (a: SubjectRef, b: SubjectRef): number => (a < b ? -1 : a > b ? 1 : 0);

/** Derives a Command's subject union (resolved + defaulted halves) from its `resolvers` keys and `defaultSubjects`. */
export function commandSubjects(config: Command): CommandSubjects {
  const resolved = Object.keys(config.resolvers).sort(byName);
  const defaulted = [...(config.defaultSubjects ?? [])].sort(byName);
  return { resolved, defaulted, all: [...resolved, ...defaulted].sort(byName) };
}
