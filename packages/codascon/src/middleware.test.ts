import { describe, it } from "vitest";
import {
  Command,
  Subject,
  MiddlewareCommand,
  type MiddlewareTemplate,
  type Template,
  type Runnable,
} from "./index.js";

function strictEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected)
    throw new Error(msg ?? `Expected ${String(expected)}, got ${String(actual)}`);
}
function deepEqual<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      msg ?? `Deep equal failed:\n  ${JSON.stringify(actual)}\n  ${JSON.stringify(expected)}`,
    );
}

// ═══════════════════════════════════════════════════════════════════
// TEST FIXTURES — Subjects
// ═══════════════════════════════════════════════════════════════════

class Rock extends Subject {
  readonly resolverName = "resolveRock" as const;
  constructor(public readonly weight: number) {
    super();
  }
}

class Gem extends Subject {
  readonly resolverName = "resolveGem" as const;
  constructor(public readonly value: number) {
    super();
  }
}

type Ctx = { factor: number };
type Res = number;

// ═══════════════════════════════════════════════════════════════════
// TEST FIXTURES — Core command
// ═══════════════════════════════════════════════════════════════════

class MeasureCommand extends Command<object, Ctx, Res, [Rock, Gem]> {
  readonly commandName = "measure" as const;

  resolveRock(_r: Rock, _ctx: Readonly<Ctx>): Template<MeasureCommand, any[], Rock> {
    return { execute: (s, o) => s.weight * o.factor };
  }

  resolveGem(_g: Gem, _ctx: Readonly<Ctx>): Template<MeasureCommand, any[], Gem> {
    return { execute: (s, o) => s.value * o.factor };
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST FIXTURES — Middleware
// ═══════════════════════════════════════════════════════════════════

/** Records "before:<label>" and "after:<label>" around calling inner.run(). */
class TraceMiddleware extends MiddlewareCommand<object, Ctx, Res, [Rock, Gem]> {
  readonly commandName = "trace" as const;

  constructor(
    private readonly label: string,
    private readonly log: string[],
  ) {
    super();
  }

  resolveRock(_: Rock, __: Readonly<Ctx>): MiddlewareTemplate<TraceMiddleware, any[], Rock> {
    const { label, log } = this;
    return {
      execute(s: Rock, o: Ctx, inner: Runnable<Rock, Ctx, Res>): Res {
        log.push(`before:${label}`);
        const result = inner.run(s, o);
        log.push(`after:${label}`);
        return result;
      },
    };
  }

  resolveGem(_: Gem, __: Readonly<Ctx>): MiddlewareTemplate<TraceMiddleware, any[], Gem> {
    const { label, log } = this;
    return {
      execute(s: Gem, o: Ctx, inner: Runnable<Gem, Ctx, Res>): Res {
        log.push(`before:${label}`);
        const result = inner.run(s, o);
        log.push(`after:${label}`);
        return result;
      },
    };
  }
}

/** Adds a bonus to ctx.factor before calling inner.run() — tests enrichment. */
class EnrichMiddleware extends MiddlewareCommand<object, Ctx, Res, [Rock, Gem]> {
  readonly commandName = "enrich" as const;

  constructor(private readonly bonus: number) {
    super();
  }

  resolveRock(_: Rock, __: Readonly<Ctx>): MiddlewareTemplate<EnrichMiddleware, any[], Rock> {
    const { bonus } = this;
    return {
      execute(s: Rock, o: Ctx, inner: Runnable<Rock, Ctx, Res>): Res {
        return inner.run(s, { factor: o.factor + bonus });
      },
    };
  }

  resolveGem(_: Gem, __: Readonly<Ctx>): MiddlewareTemplate<EnrichMiddleware, any[], Gem> {
    const { bonus } = this;
    return {
      execute(s: Gem, o: Ctx, inner: Runnable<Gem, Ctx, Res>): Res {
        return inner.run(s, { factor: o.factor + bonus });
      },
    };
  }
}

/** Returns a fixed value without calling next — tests short-circuit. */
class BlockMiddleware extends MiddlewareCommand<object, Ctx, Res, [Rock, Gem]> {
  readonly commandName = "block" as const;

  constructor(private readonly fixed: Res) {
    super();
  }

  resolveRock(_: Rock, __: Readonly<Ctx>): MiddlewareTemplate<BlockMiddleware, any[], Rock> {
    const { fixed } = this;
    return { execute: () => fixed };
  }

  resolveGem(_: Gem, __: Readonly<Ctx>): MiddlewareTemplate<BlockMiddleware, any[], Gem> {
    const { fixed } = this;
    return { execute: () => fixed };
  }
}

// ═══════════════════════════════════════════════════════════════════
// §M1 · MIDDLEWARE DEFAULT
// ═══════════════════════════════════════════════════════════════════

describe("§M1 Command.middleware default", () => {
  it("returns [] from the default getter", () => {
    deepEqual(new MeasureCommand().middleware, []);
  });

  it("run() works correctly with no middleware", () => {
    const cmd = new MeasureCommand();
    strictEqual(cmd.run(new Rock(5), { factor: 2 }), 10);
    strictEqual(cmd.run(new Gem(3), { factor: 4 }), 12);
  });
});

// ═══════════════════════════════════════════════════════════════════
// §M2 · COMMAND-LEVEL MIDDLEWARE — SINGLE
// ═══════════════════════════════════════════════════════════════════

describe("§M2 Command-level middleware — single", () => {
  it("wraps dispatch and passes the result through", () => {
    const log: string[] = [];
    const tracer = new TraceMiddleware("T", log);

    class Cmd extends MeasureCommand {
      override get middleware() {
        return [tracer];
      }
    }

    const result = new Cmd().run(new Rock(5), { factor: 2 });

    strictEqual(result, 10);
    deepEqual(log, ["before:T", "after:T"]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// §M3 · COMMAND-LEVEL MIDDLEWARE — CHAIN ORDER
// ═══════════════════════════════════════════════════════════════════

describe("§M3 Command-level middleware — chain order", () => {
  it("leftmost middleware is outermost (runs first, finishes last)", () => {
    const log: string[] = [];
    const A = new TraceMiddleware("A", log);
    const B = new TraceMiddleware("B", log);

    class Cmd extends MeasureCommand {
      override get middleware() {
        return [A, B];
      }
    }

    new Cmd().run(new Rock(5), { factor: 2 });

    deepEqual(log, ["before:A", "before:B", "after:B", "after:A"]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// §M4 · COMMAND-LEVEL MIDDLEWARE — ENRICHMENT
// ═══════════════════════════════════════════════════════════════════

describe("§M4 Command-level middleware — object enrichment", () => {
  it("enriched object is received by inner dispatch", () => {
    const enricher = new EnrichMiddleware(8);

    class Cmd extends MeasureCommand {
      override get middleware() {
        return [enricher];
      }
    }

    // weight=5, original factor=2, enriched factor=2+8=10, result=50
    strictEqual(new Cmd().run(new Rock(5), { factor: 2 }), 50);
  });

  it("enrichment accumulates through a chain (outermost runs first)", () => {
    const A = new EnrichMiddleware(3);
    const B = new EnrichMiddleware(7);

    class Cmd extends MeasureCommand {
      // A is outer (runs first, adds 3), B is inner (adds 7): factor = 2+3+7 = 12
      override get middleware() {
        return [A, B];
      }
    }

    strictEqual(new Cmd().run(new Rock(5), { factor: 2 }), 60); // 5 * 12
  });
});

// ═══════════════════════════════════════════════════════════════════
// §M5 · COMMAND-LEVEL MIDDLEWARE — SHORT-CIRCUIT
// ═══════════════════════════════════════════════════════════════════

describe("§M5 Command-level middleware — short-circuit", () => {
  it("middleware that does not call next prevents inner execution", () => {
    const log: string[] = [];
    const blocker = new BlockMiddleware(999);
    const tracer = new TraceMiddleware("inner", log);

    class Cmd extends MeasureCommand {
      // blocker is outer (index 0, runs first, never calls next); tracer is inner (never runs)
      override get middleware() {
        return [blocker, tracer];
      }
    }

    const result = new Cmd().run(new Rock(5), { factor: 2 });

    strictEqual(result, 999);
    deepEqual(log, []); // tracer never ran
  });
});

// ═══════════════════════════════════════════════════════════════════
// §M11 · MIDDLEWARE-ON-MIDDLEWARE CHAIN ORDER
// ═══════════════════════════════════════════════════════════════════

describe("§M11 Middleware-on-middleware chain order", () => {
  it("each middleware's own middleware chain is interleaved correctly", () => {
    const log: string[] = [];
    const mwA1 = new TraceMiddleware("mwA1", log);
    const mwA2 = new TraceMiddleware("mwA2", log);
    const mwB1 = new TraceMiddleware("mwB1", log);
    const mwB2 = new TraceMiddleware("mwB2", log);

    // cmdA is a TraceMiddleware whose own middleware getter returns [mwA1, mwA2]
    const cmdA = new (class extends TraceMiddleware {
      override get middleware() {
        return [mwA1, mwA2];
      }
    })("cmdA", log);

    // cmdB is a TraceMiddleware whose own middleware getter returns [mwB1, mwB2]
    const cmdB = new (class extends TraceMiddleware {
      override get middleware() {
        return [mwB1, mwB2];
      }
    })("cmdB", log);

    class Cmd extends MeasureCommand {
      override get middleware() {
        return [cmdA, cmdB];
      }
    }

    new Cmd().run(new Rock(5), { factor: 2 });

    // mwA1/mwA2 are cmdA's own middleware (processed before cmdA dispatches)
    // mwB1/mwB2 are cmdB's own middleware (processed before cmdB dispatches)
    deepEqual(log, [
      "before:mwA1",
      "before:mwA2",
      "before:cmdA",
      "before:mwB1",
      "before:mwB2",
      "before:cmdB",
      "after:cmdB",
      "after:mwB2",
      "after:mwB1",
      "after:cmdA",
      "after:mwA2",
      "after:mwA1",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// §M9 · DOMAIN BASE CLASS MIDDLEWARE COMPOSITION
// ═══════════════════════════════════════════════════════════════════

describe("§M9 Domain base class middleware composition", () => {
  it("base class middleware is outermost; subclass composes with super.middleware", () => {
    const log: string[] = [];
    const baseTracer = new TraceMiddleware("base", log);
    const specificTracer = new TraceMiddleware("specific", log);

    class DomainCmd extends MeasureCommand {
      override get middleware() {
        return [baseTracer];
      }
    }

    class SpecificCmd extends DomainCmd {
      override get middleware() {
        return [...super.middleware, specificTracer];
      }
    }

    new SpecificCmd().run(new Rock(5), { factor: 2 });

    // base is index 0 (outermost), specific is index 1 (inner)
    deepEqual(log, ["before:base", "before:specific", "after:specific", "after:base"]);
  });
});
