/**
 * Source type proofs — compiled by `tsc` against src/index.ts via tsconfig.test.json.
 * NOT run by vitest (test.*.ts pattern, but imports from src directly — kept separate).
 *
 * Contains constraints that are only enforceable against src, where @internal members
 * are visible. These are distinct from test.constraints.ts (public dist constraints)
 * and test.dist.ts (which tests dist/index.d.ts via tsconfig.dist.json).
 *
 * Every @ts-expect-error here documents a constraint enforced by an @internal member.
 * If a directive becomes unused, it means the @internal protection has been removed or
 * the constraint has moved to the public API surface (update accordingly).
 */

import {
  MiddlewareCommand,
  Subject,
  type MiddlewareTemplate,
  type Runnable,
} from "../src/index.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface Person {
  name: string;
}

class Dog extends Subject implements Person {
  readonly resolverName = "resolveDog" as const;
  constructor(
    public readonly name: string,
    public readonly breed: string,
  ) {
    super();
  }
}

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
      execute<T extends Rock>(s: T, o: Ctx, inner: Runnable<T, Ctx, Res>): Res {
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
      execute<T extends Gem>(s: T, o: Ctx, inner: Runnable<T, Ctx, Res>): Res {
        log.push(`before:${label}`);
        const result = inner.run(s, o);
        log.push(`after:${label}`);
        return result;
      },
    };
  }
}

// ─── §MC1b — Complete MiddlewareCommand: run() still uncallable ───────────────
//
// A fully covered MiddlewareCommand (all resolvers present) still cannot call run().
// MiddlewareCommand.run() is @internal and declares `this: never`, which makes every
// call site a type error regardless of resolver coverage.

{
  const _mc1b = new TraceMiddleware("t", []);
  const _mc1b_run = () => {
    // @ts-expect-error — MiddlewareCommand.run() declares `this: never` (@internal);
    // uncallable even when all resolvers are present.
    _mc1b.run(new Rock(1), { factor: 1 });
  };
  void _mc1b_run;
}

// ─── §14j5 — MiddlewareCommand.run() uncallable on fully covered instance ────
//
// run(this: never) applies regardless of whether resolver methods or defaultResolver
// are present. A fully covered MiddlewareCommand is still uncallable via run().

{
  class CoveredMw extends MiddlewareCommand<Person, string, string, [Dog]> {
    readonly commandName = "coveredMw" as const;
    resolveDog(_d: Dog) {
      return {
        execute: <T extends Dog>(s: T, o: string, inner: Runnable<T, string, string>) =>
          inner.run(s, o),
      };
    }
  }
  const cmd = new CoveredMw();
  const _14j5 = () => {
    // @ts-expect-error — MiddlewareCommand.run() is always uncallable (this: never, @internal)
    cmd.run(new Dog("Rex", "Lab"), "");
  };
  void _14j5;
}
