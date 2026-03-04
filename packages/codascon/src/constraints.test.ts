import { describe, it } from "vitest";
import {
  Command,
  Subject,
  type Template,
  type CommandObject,
  type CommandReturn,
  type CommandName,
  type SubjectVisitName,
  type CommandSubjectUnion,
} from "./index.js";

function strictEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) throw new Error(msg ?? `Expected ${expected}, got ${actual}`);
}

// ═══════════════════════════════════════════════════════════════════
// FIXTURES — duplicated from index.test.ts; kept minimal and
// self-contained so this file can be read and verified independently.
// ═══════════════════════════════════════════════════════════════════

interface Person {
  name: string;
}

class Dog extends Subject implements Person {
  readonly visitName = "resolveDog" as const;
  constructor(
    public readonly name: string,
    public readonly breed: string,
  ) {
    super();
  }
}

class Cat extends Subject implements Person {
  readonly visitName = "resolveCat" as const;
  constructor(
    public readonly name: string,
    public readonly indoor: boolean,
  ) {
    super();
  }
}

class Bird extends Subject implements Person {
  readonly visitName = "resolveBird" as const;
  constructor(
    public readonly name: string,
    public readonly canFly: boolean,
  ) {
    super();
  }
}

interface Clinic {
  name: string;
  hasEmergency: boolean;
}
interface FeedResult {
  fed: boolean;
  food: string;
  amount: number;
}
interface GroomResult {
  groomed: boolean;
  service: string;
  cost: number;
}
interface LogEntry {
  action: string;
  subject: string;
}

class FeedCommand extends Command<Person, { time: string }, FeedResult, [Dog, Cat, Bird]> {
  readonly commandName = "feed" as const;

  resolveDog(dog: Dog, obj: Readonly<{ time: string }>): Template<FeedCommand, any[], Dog> {
    return {
      execute: (subject: Dog, object: { time: string }): FeedResult => ({
        fed: true,
        food: subject.breed === "Labrador" ? "large kibble" : "small kibble",
        amount: subject.breed === "Labrador" ? 3 : 1.5,
      }),
    };
  }

  resolveCat(cat: Cat, obj: Readonly<{ time: string }>): Template<FeedCommand, any[], Cat> {
    return {
      execute: (subject: Cat, object: { time: string }): FeedResult => ({
        fed: true,
        food: subject.indoor ? "indoor formula" : "outdoor mix",
        amount: 1,
      }),
    };
  }

  resolveBird(bird: Bird, obj: Readonly<{ time: string }>): Template<FeedCommand, any[], Bird> {
    return {
      execute: (subject: Bird, object: { time: string }): FeedResult => ({
        fed: bird.canFly,
        food: bird.canFly ? "seed mix" : "pellets",
        amount: 0.2,
      }),
    };
  }
}

class GroomCommand extends Command<Person, Clinic, GroomResult, [Dog, Cat]> {
  readonly commandName = "groom" as const;

  resolveDog(dog: Dog, clinic: Readonly<Clinic>): Template<GroomCommand, any[], Dog> {
    return {
      execute: (subject: Dog, object: Clinic): GroomResult => ({
        groomed: true,
        service: subject.breed === "Poodle" ? "full clip" : "bath & brush",
        cost: subject.breed === "Poodle" ? 80 : 40,
      }),
    };
  }

  resolveCat(cat: Cat, clinic: Readonly<Clinic>): Template<GroomCommand, any[], Cat> {
    return {
      execute: (subject: Cat, object: Clinic): GroomResult => ({
        groomed: cat.indoor,
        service: cat.indoor ? "nail trim" : "skipped — outdoor cat",
        cost: cat.indoor ? 25 : 0,
      }),
    };
  }
}

class AsyncFeedCommand extends Command<Person, { time: string }, Promise<FeedResult>, [Dog, Cat]> {
  readonly commandName = "asyncFeed" as const;

  resolveDog(dog: Dog, obj: Readonly<{ time: string }>) {
    return {
      execute: async (subject: Dog, object: { time: string }): Promise<FeedResult> => {
        await new Promise((r) => setTimeout(r, 10));
        return { fed: true, food: "async kibble", amount: 2 };
      },
    };
  }

  resolveCat(cat: Cat, obj: Readonly<{ time: string }>) {
    return {
      execute: async (subject: Cat, object: { time: string }): Promise<FeedResult> => {
        await new Promise((r) => setTimeout(r, 10));
        return { fed: true, food: "async wet food", amount: 1 };
      },
    };
  }
}

class LogCommand extends Command<Person, { action: string }, LogEntry, [Dog, Cat, Bird]> {
  readonly commandName = "log" as const;
  resolveDog(d: Dog) {
    return {
      execute: (s: Dog, o: { action: string }): LogEntry => ({ action: o.action, subject: s.name }),
    };
  }
  resolveCat(c: Cat) {
    return {
      execute: (s: Cat, o: { action: string }): LogEntry => ({ action: o.action, subject: s.name }),
    };
  }
  resolveBird(b: Bird) {
    return {
      execute: (s: Bird, o: { action: string }): LogEntry => ({
        action: o.action,
        subject: s.name,
      }),
    };
  }
}

class DogOnlyCommand extends Command<Person, string, number, [Dog]> {
  readonly commandName = "dogOnly" as const;
  resolveDog(dog: Dog, obj: Readonly<string>) {
    return {
      execute: (s: Dog, o: string): number => s.name.length + o.length,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// §11 · TYPE-LEVEL ASSERTIONS
// ═══════════════════════════════════════════════════════════════════

// Helper: assert type equality at compile time
type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// SubjectVisitName extracts literal
type _T1 = Expect<Equal<SubjectVisitName<Dog>, "resolveDog">>;
type _T2 = Expect<Equal<SubjectVisitName<Cat>, "resolveCat">>;
type _T3 = Expect<Equal<SubjectVisitName<Bird>, "resolveBird">>;

// SubjectVisitName rejects non-literal
class BadSubject extends Subject {
  readonly visitName: string = "oops";
}
type _T4 = Expect<Equal<SubjectVisitName<BadSubject>, never>>;

// CommandName extracts literal
type _T5 = Expect<Equal<CommandName<FeedCommand>, "feed">>;
type _T6 = Expect<Equal<CommandName<GroomCommand>, "groom">>;

// CommandObject extracts object type
type _T7 = Expect<Equal<CommandObject<FeedCommand>, { time: string }>>;
type _T8 = Expect<Equal<CommandObject<GroomCommand>, Clinic>>;

// CommandReturn extracts return type
type _T9 = Expect<Equal<CommandReturn<FeedCommand>, FeedResult>>;
type _T10 = Expect<Equal<CommandReturn<GroomCommand>, GroomResult>>;

// CommandReturn works with async
type _T11 = Expect<Equal<CommandReturn<AsyncFeedCommand>, Promise<FeedResult>>>;

// Template with default hooks resolves cleanly
type SimpleTemplate = Template<FeedCommand>;
type _T12 = Expect<
  Equal<
    SimpleTemplate,
    { execute<T extends Dog | Cat | Bird>(subject: T, object: { time: string }): FeedResult }
  >
>;

// CommandSubjectUnion extracts the subject union
type _T13 = Expect<Equal<CommandSubjectUnion<FeedCommand>, Dog | Cat | Bird>>;
type _T14 = Expect<Equal<CommandSubjectUnion<GroomCommand>, Dog | Cat>>;

describe("§11 type-level assertions", () => {
  it("type assertions verified by tsc --build (compile-time proof)", () => {
    // All type assertions above (_T1–_T14) are verified at compile time by tsc --build,
    // which includes constraints.test.ts via tsconfig.json include: ["src"].
    // If any assertion fails, tsc fails — no runtime check needed.
    void 0;
  });
});

// ═══════════════════════════════════════════════════════════════════
// §14 · COMPILE-TIME CONSTRAINT TESTS
//
//   Every @ts-expect-error must trigger.  If the directive is unused,
//   tsc --noEmit fails — proving the framework ALLOWS something it
//   should reject.  Compilation success = all constraints hold.
// ═══════════════════════════════════════════════════════════════════

// ── 14a. Missing visit method on Command ─────────────────────────

{
  class IncompleteFeedCommand extends Command<
    Person,
    { time: string },
    FeedResult,
    [Dog, Cat, Bird]
  > {
    readonly commandName = "incompleteFeed" as const;
    resolveDog() {
      return {
        execute: (s: Dog, o: { time: string }): FeedResult => ({ fed: true, food: "x", amount: 1 }),
      };
    }
    resolveCat() {
      return {
        execute: (s: Cat, o: { time: string }): FeedResult => ({ fed: true, food: "x", amount: 1 }),
      };
    }
    // resolveBird intentionally missing — error surfaces at call site
  }
  const cmd = new IncompleteFeedCommand();
  const _14a = () => {
    // @ts-expect-error — `this` constraint unsatisfied: resolveBird missing
    cmd.run(new Dog("x", "y"), { time: "am" });
  };
}

// ── 14b. Running command on unsupported subject ──────────────────

{
  const dogOnly = new DogOnlyCommand();
  const _14b = () => {
    // @ts-expect-error — DogOnlyCommand only visits [Dog], Cat is not in the union
    dogOnly.run(new Cat("Mimi", true), "hello");

    // @ts-expect-error — Bird also not in the union
    dogOnly.run(new Bird("Tweety", true), "hello");
  };
}

// ── 14c. Template missing hook dependency ────────────────────────

{
  // @ts-expect-error — IncompleteHookTemplate is missing `log` property
  // required by CommandHooks<[LogCommand]>
  class IncompleteHookTemplate implements Template<FeedCommand, [LogCommand]> {
    execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
      return { fed: false, food: "none", amount: 0 };
    }
  }
}

// ── 14d. Hook command that doesn't visit the subject union ───────
//
//   Template<C, H, SU> declares `H extends AnyCommand[] & SubjectUnionVisitors<SU, H>`.
//   This constraint is semantically correct but TypeScript can't enforce it
//   at the type alias instantiation site: `CommandSubjectUnion<H[K]>` uses
//   `infer CSU` on a class type inside a constraint position, which resolves
//   to `any`, making `SU extends any` always true.
//
//   Enforcement instead happens at TWO other sites:
//     1. `implements` — CommandHooks<H> requires the hook as a structural property
//     2. Hook invocation — this.hook.run(subject, ...) checks the hook command's
//        own `this & CommandSubjectStrategies` constraint, catching wrong subjects
//
//   The compile-time proof below verifies enforcement at the invocation site.

{
  class CatOnlyCommand extends Command<Person, string, string, [Cat]> {
    readonly commandName = "catOnly" as const;
    resolveCat() {
      return { execute: (s: Cat, o: string): string => "cat" };
    }
  }
  const catOnly = new CatOnlyCommand();
  const _14d = () => {
    // @ts-expect-error — Dog is not assignable to Cat (CatOnlyCommand's subject union)
    catOnly.run(new Dog("Rex", "Lab"), "data");
  };
}

// ── 14e. Non-literal visitName — compile error at run() call site ─
//
//   When visitName is `string` (not a literal), WithLiteralVisitNames<CSU>
//   resolves to an impossible structural requirement on run()'s `this`
//   parameter: { "Error: One or more Subjects...": never }.
//   Since no Command class has this property, run() becomes uncallable
//   at the call site — a compile-time error instead of a silent runtime failure.

{
  class DynamicVisitName extends Subject implements Person {
    readonly visitName: string = "dynamic";
    constructor(public readonly name: string) {
      super();
    }
  }
  class DynamicCommand extends Command<Person, string, string, [DynamicVisitName]> {
    readonly commandName = "dynamic" as const;
  }
  const _cmd = new DynamicCommand();
  const _14e = () => {
    // @ts-expect-error — DynamicVisitName.visitName is 'string' not a literal;
    // WithLiteralVisitNames<[DynamicVisitName]> resolves to { "Error: ...": never }
    _cmd.run(new DynamicVisitName("x"), "test");
  };
}

// ── 14f. Wrong return type from visit method ─────────────────────

{
  class WrongReturnCommand extends Command<Person, { time: string }, FeedResult, [Dog]> {
    readonly commandName = "wrongReturn" as const;
    resolveDog() {
      return { execute: (s: Dog, o: { time: string }): string => "not a FeedResult" };
    }
  }
  const cmd = new WrongReturnCommand();
  const _14f = () => {
    // @ts-expect-error — resolveDog returns execute:()=>string, but run expects FeedResult
    cmd.run(new Dog("x", "y"), { time: "am" });
  };
}

// ── 14g. Wrong object type in template execute ───────────────────

{
  class WrongObjectTemplate {
    execute(subject: Dog, object: number): FeedResult {
      return { fed: true, food: "x", amount: 1 };
    }
  }

  class WrongObjectCommand extends Command<Person, { time: string }, FeedResult, [Dog]> {
    readonly commandName = "wrongObj" as const;
    resolveDog() {
      return new WrongObjectTemplate();
    }
  }
  const cmd = new WrongObjectCommand();
  const _14g = () => {
    // @ts-expect-error — WrongObjectTemplate.execute expects number, not { time: string }
    cmd.run(new Dog("x", "y"), { time: "am" });
  };
}

// ── 14h. Subject not extending Subject base class ────────────────

{
  class NotASubject {
    readonly visitName = "resolveNotASubject" as const;
  }

  // @ts-expect-error — NotASubject doesn't extend Subject, so [NotASubject]
  // doesn't satisfy CSU extends (B & Subject)[]
  class BadSubjectCommand extends Command<{}, string, string, [NotASubject]> {
    readonly commandName = "badSubject" as const;
    resolveNotASubject() {
      return { execute: () => "x" };
    }
  }
}

// ── 14i. Duplicate visit names — two subjects with same visitName ─

{
  class Impostor extends Subject {
    readonly visitName = "resolveDog" as const; // same as Dog!
    constructor(public readonly name: string) {
      super();
    }
  }

  // Both Dog and Impostor resolve to "resolveDog" — the UnionToIntersection
  // merges their handlers into (subject: Dog & Impostor, ...) => ...,
  // making the handler impossible to implement correctly.
  class ConflictCommand extends Command<Person, string, string, [Dog, Impostor]> {
    readonly commandName = "conflict" as const;
    resolveDog(s: Dog & Impostor) {
      return { execute: (s: Dog & Impostor, o: string): string => s.name };
    }
  }
  const cmd = new ConflictCommand();
  const _14i = () => {
    // @ts-expect-error — Dog doesn't satisfy Dog & Impostor
    cmd.run(new Dog("Rex", "Lab"), "test");
  };
}

describe("§14 compile-time constraint tests", () => {
  // All constraints are verified at compile time by tsc --build (which includes
  // constraints.test.ts via tsconfig.json include: ["src"]). Each @ts-expect-error
  // block above proves the framework rejects the invalid usage — if the error
  // disappears, tsc fails. No runtime assertions are needed; compilation = proof.

  it("14a: missing visit method rejected at call site", () => void 0);
  it("14b: unsupported subject rejected at call site", () => void 0);
  it("14c: template missing hook dependency rejected at implements", () => void 0);

  it("14d: hook-subject mismatch caught at hook invocation site (runtime + compile)", () => {
    // CatOnlyCommand only visits Cat, but we wire it as a hook into a Dog template.
    // Structurally valid at implements site; error surfaces when the hook is invoked
    // on the wrong subject (caught at call site by the command's this constraint).
    class CatOnlyCommand extends Command<Person, string, string, [Cat]> {
      readonly commandName = "catOnly" as const;
      resolveCat() {
        return { execute: (s: Cat, o: string): string => "cat" };
      }
    }

    class MiswiredTemplate implements Template<DogOnlyCommand, [CatOnlyCommand], Dog> {
      catOnly: CatOnlyCommand;
      constructor(c: CatOnlyCommand) {
        this.catOnly = c;
      }
      execute(subject: Dog, object: string): number {
        // Invoking this.catOnly.run(subject, "data") here would be a compile error —
        // Dog is not assignable to Cat (CatOnlyCommand's subject union).
        return subject.name.length;
      }
    }

    class HookedDogCmd extends Command<Person, string, number, [Dog]> {
      readonly commandName = "hookedDog" as const;
      private catCmd: CatOnlyCommand;
      constructor(c: CatOnlyCommand) {
        super();
        this.catCmd = c;
      }
      resolveDog() {
        return new MiswiredTemplate(this.catCmd);
      }
    }

    // Template works fine when it doesn't invoke the mismatched hook
    const cmd = new HookedDogCmd(new CatOnlyCommand());
    strictEqual(cmd.run(new Dog("Rex", "Lab"), "test"), 3);
  });

  it("14e: non-literal visitName — run() rejected at call site", () => void 0);
  it("14f: wrong return type from execute rejected at call site", () => void 0);
  it("14g: wrong object type in execute rejected at call site", () => void 0);
  it("14h: non-Subject in CSU tuple rejected", () => void 0);
  it("14i: duplicate visitName — conflicting handlers rejected", () => void 0);
});
