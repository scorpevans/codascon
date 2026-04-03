import { describe, it } from "vitest";
import { Command, MiddlewareCommand, Subject, type Runnable } from "codascon";

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

class Cat extends Subject implements Person {
  readonly resolverName = "resolveCat" as const;
  constructor(
    public readonly name: string,
    public readonly indoor: boolean,
  ) {
    super();
  }
}

// ═══════════════════════════════════════════════════════════════════
// §D · DEFAULT RESOLVER
//
//   When a Command declares `defaultResolver`, subjects without a
//   specific resolver method fall through to it. Specific resolver
//   methods take precedence when present.
//
//   Declaring `defaultResolver` relaxes the exhaustiveness constraint:
//   run() is callable even when specific resolver methods are absent.
// ═══════════════════════════════════════════════════════════════════

class DefaultOnlyResult {
  execute(subject: Dog | Cat, object: string): string {
    return `default:${subject.name}`;
  }
}

class DogSpecificResult {
  execute(subject: Dog, object: string): string {
    return `specific:${subject.name}`;
  }
}

// Command with only defaultResolver — no specific resolver methods
class DefaultOnlyCommand extends Command<Person, string, string, [Dog, Cat]> {
  readonly commandName = "defaultOnly" as const;
  readonly defaultResolver = new DefaultOnlyResult();
}

// Command with defaultResolver AND a specific resolver — specific takes precedence
class MixedCommand extends Command<Person, string, string, [Dog, Cat]> {
  readonly commandName = "mixed" as const;
  resolveDog(subject: Dog, object: string) {
    return new DogSpecificResult();
  }
  readonly defaultResolver = new DefaultOnlyResult();
}

describe("§D defaultResolver — catch-all fallback when no specific resolver is defined", () => {
  it("defaultResolver fires for every subject when no specific resolver methods are defined", () => {
    const cmd = new DefaultOnlyCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), ""), "default:Rex");
    strictEqual(cmd.run(new Cat("Whiskers", true), ""), "default:Whiskers");
  });

  it("specific resolver takes precedence over defaultResolver when both are defined", () => {
    const cmd = new MixedCommand();
    // Dog has a specific resolver
    strictEqual(cmd.run(new Dog("Rex", "Lab"), ""), "specific:Rex");
    // Cat has no specific resolver — falls through to defaultResolver
    strictEqual(cmd.run(new Cat("Whiskers", true), ""), "default:Whiskers");
  });

  it("defaultResolver receives the object argument", () => {
    const received: string[] = [];
    class ObservingCommand extends Command<Person, string, string, [Dog]> {
      readonly commandName = "observing" as const;
      readonly defaultResolver = {
        execute: (subject: Dog, object: string): string => {
          received.push(object);
          return `default:${subject.name}`;
        },
      };
    }
    const cmd = new ObservingCommand();
    cmd.run(new Dog("Rex", "Lab"), "payload");
    deepEqual(received, ["payload"]);
  });

  it("run() is callable without any specific resolver methods when defaultResolver is declared", () => {
    // Compile-time proof: DefaultOnlyCommand has no resolveDog / resolveCat,
    // yet run() is callable because defaultResolver is declared.
    const cmd = new DefaultOnlyCommand();
    const result = cmd.run(new Dog("Rex", "Lab"), "");
    strictEqual(result, "default:Rex");
  });

  it("defaultResolver fires correctly when command-level middleware is registered", () => {
    // Verifies that middleware wraps the full dispatch cycle — including the
    // defaultResolver fallback path — without special-casing it.
    const log: string[] = [];

    class WrapMiddleware extends MiddlewareCommand<Person, string, string, [Dog, Cat]> {
      readonly commandName = "wrap" as const;
      resolveDog(_d: Dog) {
        return {
          execute: <T extends Dog>(s: T, o: string, inner: Runnable<T, string, string>) => {
            log.push("before");
            const r = inner.run(s, o);
            log.push("after");
            return r;
          },
        };
      }
      resolveCat(_c: Cat) {
        return {
          execute: <T extends Cat>(s: T, o: string, inner: Runnable<T, string, string>) => {
            log.push("before");
            const r = inner.run(s, o);
            log.push("after");
            return r;
          },
        };
      }
    }

    class DefaultWithMiddlewareCommand extends Command<Person, string, string, [Dog, Cat]> {
      readonly commandName = "defaultWithMiddleware" as const;
      private readonly mw = new WrapMiddleware();
      override get middleware() {
        return [this.mw];
      }
      readonly defaultResolver = {
        execute: (s: Dog | Cat, _o: string): string => `default:${s.name}`,
      };
    }

    const cmd = new DefaultWithMiddlewareCommand();

    log.length = 0;
    strictEqual(cmd.run(new Dog("Rex", "Lab"), ""), "default:Rex");
    deepEqual(log, ["before", "after"]);

    log.length = 0;
    strictEqual(cmd.run(new Cat("Whiskers", true), ""), "default:Whiskers");
    deepEqual(log, ["before", "after"]);
  });

  it("MiddlewareCommand with defaultResolver preserves chain when registered as middleware", () => {
    // A MiddlewareCommand that mixes a specific resolver (Dog) with defaultResolver (Cat
    // falls through). Both paths must correctly invoke inner.run() to keep the chain intact.
    const log: string[] = [];

    class MixedMw extends MiddlewareCommand<Person, string, string, [Dog, Cat]> {
      readonly commandName = "mixedMw" as const;
      resolveDog(_d: Dog) {
        return {
          execute: <T extends Dog>(s: T, o: string, inner: Runnable<T, string, string>) => {
            log.push("mw-dog-before");
            const r = inner.run(s, o);
            log.push("mw-dog-after");
            return r;
          },
        };
      }
      override readonly defaultResolver = {
        execute: <T extends Dog | Cat>(s: T, o: string, inner: Runnable<T, string, string>) => {
          log.push("mw-default-before");
          const r = inner.run(s, o);
          log.push("mw-default-after");
          return r;
        },
      };
    }

    class InnerCommand extends Command<Person, string, string, [Dog, Cat]> {
      readonly commandName = "inner" as const;
      private readonly mw = new MixedMw();
      override get middleware() {
        return [this.mw];
      }
      resolveDog(s: Dog) {
        return { execute: (_s: Dog): string => `dog:${s.name}` };
      }
      resolveCat(s: Cat) {
        return { execute: (_s: Cat): string => `cat:${s.name}` };
      }
    }

    const cmd = new InnerCommand();

    // Dog dispatches via specific middleware resolver
    log.length = 0;
    strictEqual(cmd.run(new Dog("Rex", "Lab"), ""), "dog:Rex");
    deepEqual(log, ["mw-dog-before", "mw-dog-after"]);

    // Cat falls through to middleware defaultResolver
    log.length = 0;
    strictEqual(cmd.run(new Cat("Whiskers", true), ""), "cat:Whiskers");
    deepEqual(log, ["mw-default-before", "mw-default-after"]);
  });

  it("defaultResolver path is preserved through a 2-layer middleware stack (chain order)", () => {
    // Verifies that the reduceRight chain in _runChain correctly threads
    // the terminal defaultResolver step through two middleware layers.
    // Expected order: outer wraps inner wraps the terminal defaultResolver execute.
    const log: string[] = [];

    class OuterMw extends MiddlewareCommand<Person, string, string, [Dog, Cat]> {
      readonly commandName = "outer2l" as const;
      resolveDog(_d: Dog) {
        return {
          execute: <T extends Dog>(s: T, o: string, inner: Runnable<T, string, string>) => {
            log.push("outer-before");
            const r = inner.run(s, o);
            log.push("outer-after");
            return r;
          },
        };
      }
      resolveCat(_c: Cat) {
        return {
          execute: <T extends Cat>(s: T, o: string, inner: Runnable<T, string, string>) => {
            log.push("outer-before");
            const r = inner.run(s, o);
            log.push("outer-after");
            return r;
          },
        };
      }
    }

    class InnerMw extends MiddlewareCommand<Person, string, string, [Dog, Cat]> {
      readonly commandName = "inner2l" as const;
      resolveDog(_d: Dog) {
        return {
          execute: <T extends Dog>(s: T, o: string, inner: Runnable<T, string, string>) => {
            log.push("inner-before");
            const r = inner.run(s, o);
            log.push("inner-after");
            return r;
          },
        };
      }
      resolveCat(_c: Cat) {
        return {
          execute: <T extends Cat>(s: T, o: string, inner: Runnable<T, string, string>) => {
            log.push("inner-before");
            const r = inner.run(s, o);
            log.push("inner-after");
            return r;
          },
        };
      }
    }

    class TwoLayerCmd extends Command<Person, string, string, [Dog, Cat]> {
      readonly commandName = "twoLayerDef" as const;
      private readonly outerMw = new OuterMw();
      private readonly innerMw = new InnerMw();
      override get middleware() {
        return [this.outerMw, this.innerMw];
      }
      readonly defaultResolver = {
        execute: (s: Dog | Cat, _o: string): string => `default:${s.name}`,
      };
    }

    const cmd = new TwoLayerCmd();

    strictEqual(cmd.run(new Dog("Rex", "Lab"), ""), "default:Rex");
    deepEqual(log, ["outer-before", "inner-before", "inner-after", "outer-after"]);

    log.length = 0;
    strictEqual(cmd.run(new Cat("Whiskers", true), ""), "default:Whiskers");
    deepEqual(log, ["outer-before", "inner-before", "inner-after", "outer-after"]);
  });
});
