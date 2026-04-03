import { describe, it } from "vitest";
import { Subject } from "codascon";

function strictEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) throw new Error(msg ?? `Expected ${expected}, got ${actual}`);
}

// ═══════════════════════════════════════════════════════════════════
// §19 · SUBJECT CONSTRUCTOR CONTRACT
//
//   Subject's constructor must remain callable with no arguments so
//   that all downstream subclasses — which call super() with no args —
//   continue to compile and run without modification.
//
//   This test makes that contract explicit and load-bearing: if Subject
//   ever gains a required constructor parameter, this test fails at
//   compile time before any downstream package is affected.
// ═══════════════════════════════════════════════════════════════════

describe("§19 Subject constructor contract — super() takes no required arguments", () => {
  it("a subclass calling super() with no arguments constructs successfully", () => {
    class MinimalSubject extends Subject {
      readonly resolverName = "resolveMinimal" as const;
      constructor() {
        super();
      }
    }

    const subject = new MinimalSubject();
    strictEqual(subject.resolverName, "resolveMinimal");
  });
});
