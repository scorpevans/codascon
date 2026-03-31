import { describe, it } from "vitest";
import {
  Command,
  MiddlewareCommand,
  Subject,
  type Template,
  type CommandObject,
  type CommandReturn,
  type CommandName,
  type SubjectResolverName,
  type CommandSubjectUnion,
  type MiddlewareTemplate,
  type Runnable,
} from "./index.js";

function strictEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) throw new Error(msg ?? `Expected ${expected}, got ${actual}`);
}
function deepEqual<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      msg ?? `Deep equal failed:\n  ${JSON.stringify(actual)}\n  ${JSON.stringify(expected)}`,
    );
}

// ═══════════════════════════════════════════════════════════════════
// TEST FIXTURES — Core domain (needed for §11, §14)
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

class Bird extends Subject implements Person {
  readonly resolverName = "resolveBird" as const;
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

interface LogEntry {
  action: string;
  subject: string;
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
// TEST FIXTURES — Middleware domain (needed for §MC)
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

class MeasureCommand extends Command<object, Ctx, Res, [Rock, Gem]> {
  readonly commandName = "measure" as const;

  resolveRock(_r: Rock, _ctx: Readonly<Ctx>): Template<MeasureCommand, any[], Rock> {
    return { execute: (s, o) => s.weight * o.factor };
  }

  resolveGem(_g: Gem, _ctx: Readonly<Ctx>): Template<MeasureCommand, any[], Gem> {
    return { execute: (s, o) => s.value * o.factor };
  }
}

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

// ═══════════════════════════════════════════════════════════════════
// §11 · TYPE-LEVEL ASSERTIONS
// §14 · COMPILE-TIME CONSTRAINT TESTS
// §MC · MIDDLEWARE COMPILE-TIME CONSTRAINTS
// (moved from core.test.ts, middleware.test.ts, resolver.test.ts)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// §11 · TYPE-LEVEL ASSERTIONS
// ═══════════════════════════════════════════════════════════════════

// Helper: assert type equality at compile time
type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// SubjectResolverName extracts literal
type _T1 = Expect<Equal<SubjectResolverName<Dog>, "resolveDog">>;
type _T2 = Expect<Equal<SubjectResolverName<Cat>, "resolveCat">>;
type _T3 = Expect<Equal<SubjectResolverName<Bird>, "resolveBird">>;

// SubjectResolverName returns `never` for non-literal resolverNames. Enforcement is via
// RequireLiteralResolverNames<BSL> in Command.run's this constraint, which fires at
// the call site with concrete BSL rather than inside the method body.
class BadSubject extends Subject {
  readonly resolverName: string = "oops";
}
type _T4 = Expect<Equal<SubjectResolverName<BadSubject>, never>>;

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

// CommandSubjectUnion resolves to the concrete union — not `any` — for concrete Command
// subclasses. This guards against the regression where B=any in the conditional type
// collapsed the CSU constraint to Subject[], causing TypeScript to short-circuit to any.
// Equal<any, T> = true (any-blind), so we use IsAny to assert the result is not `any`.
type IsAny<T> = 0 extends 1 & T ? true : false;
type _T13_notAny = Expect<Equal<IsAny<CommandSubjectUnion<FeedCommand>>, false>>;
type _T14_notAny = Expect<Equal<IsAny<CommandSubjectUnion<GroomCommand>>, false>>;

// CommandName returns an error string (not never) for non-literal commandName —
// so hook properties keyed by a non-literal name surface an error rather than
// silently disappearing from the Template's implements check.
type _T15 = Expect<
  Equal<
    CommandName<{ commandName: string }>,
    "commandName must be a literal. Fix: readonly commandName = 'myHook' as const"
  >
>;

// Utility types return never for non-Command inputs.
type _T16 = Expect<Equal<CommandObject<string>, never>>;
type _T17 = Expect<Equal<CommandReturn<string>, never>>;
type _T18 = Expect<Equal<CommandSubjectUnion<string>, never>>;

// CommandSubjectStrategies is an internal type (not exported) used as the `this`
// constraint on Command.run(). It cannot be directly imported or asserted against
// here — doing so would require exporting it, which would strip it from the .d.ts
// via @internal + stripInternal and create a dangling reference in run()'s signature.
//
// The constraint is proven indirectly:
// - _CSS3 below: a correctly implemented Command satisfies the constraint
//   (cmd.run() compiles; if any resolver method were missing, the call site would fail)
// - §14: incorrect implementations are rejected (missing resolver method, wrong types, etc.)
//
// Shape note (documented in typescript-gotchas.md): CommandSubjectStrategies<FeedCommand>
// (concrete class) evaluates to {} due to circular inference in run()'s this constraint.
// The base class form Command<B, O, R, CSU> evaluates correctly to the expected
// intersection of per-subject resolver methods, but requires the type to be importable.

// A correctly implemented Command satisfies its own CommandSubjectStrategies —
// proved by the function body compiling: if FeedCommand violated the this constraint,
// tsc would reject cmd.run() at the call site.
const _css3Proof = (cmd: FeedCommand, dog: Dog) => cmd.run(dog, { time: "x" });
type _CSS3 = Expect<
  typeof _css3Proof extends (cmd: FeedCommand, dog: Dog) => FeedResult ? true : false
>;

describe("§11 type-level assertions", () => {
  it("type assertions verified by tsc --build (compile-time proof)", () => {
    // All type assertions above (_T1–_T18, _T13_notAny, _T14_notAny, _CSS3) are verified at
    // compile time by tsc --build, which includes core.test.ts via tsconfig.json
    // include: ["src"]. If any assertion fails, tsc fails — no runtime check needed.
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

// ── 14a. Missing resolver method on Command ─────────────────────────

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
//   CommandHooks<H, SU> checks that each hook Command declares resolver methods
//   for every Subject in SU (via `SubjectResolverName<SU>` key presence).
//   This is a simple structural extends check — no `infer` involved —
//   so TypeScript evaluates it concretely even inside mapped type bodies.
//
//   Enforcement happens at TWO sites:
//     1. `implements` site — if the hook is missing a resolver method for any Subject
//        in SU, the hook property resolves to `never` (proven in the `it` block)
//     2. Invocation site — calling hook.run(subject) with the wrong subject is
//        also rejected by the hook Command's own this-constraint (proven below)
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

// ── 14e. Non-literal resolverName — compile error at run() call site ─
//
//   When resolverName is `string` (not a literal), WithLiteralResolverNames<CSU>
//   resolves to an impossible structural requirement on run()'s `this`
//   parameter: { "Error: One or more Subjects...": never }.
//   Since no Command class has this property, run() becomes uncallable
//   at the call site — a compile-time error instead of a silent runtime failure.

{
  class DynamicResolverName extends Subject implements Person {
    readonly resolverName: string = "dynamic";
    constructor(public readonly name: string) {
      super();
    }
  }
  class DynamicCommand extends Command<Person, string, string, [DynamicResolverName]> {
    readonly commandName = "dynamic" as const;
  }
  const _cmd = new DynamicCommand();
  const _14e = () => {
    // @ts-expect-error — DynamicResolverName.resolverName is 'string' not a literal;
    // ValidResolverNames<[DynamicResolverName]> produces { [WidenedResolverNameError]: never } — run() uncallable
    _cmd.run(new DynamicResolverName("x"), "test");
  };
}

// ── 14f. Wrong return type from resolver method ─────────────────────

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
    readonly resolverName = "resolveNotASubject" as const;
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

// ── 14i. Duplicate visit names — two subjects with same resolverName ─

{
  class Impostor extends Subject {
    readonly resolverName = "resolveDog" as const; // same as Dog!
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

// ── §14l proof — regression guard for CommandHooks with free SU ─────────────────────────────────
//
// Abstract parameterized template with hook declared at the abstract level (free SU).
// If CommandHooks is changed back to a conditional type, this class produces TS2416 at
// `readonly log = new LogCommand()` and breaks the build — making the regression visible.
// LogCommand covers all of FeedCommand's subjects [Dog, Cat, Bird], so the intersection
// `LogCommand & { resolveDog:any; resolveCat:any; resolveBird:any }` is satisfied.
abstract class FeedTemplateWithHook<
  SU extends CommandSubjectUnion<FeedCommand>,
> implements Template<FeedCommand, [LogCommand], SU> {
  readonly log = new LogCommand();
  abstract execute(subject: SU, object: { time: string }): FeedResult;
}

class DogFeedWithHook
  extends FeedTemplateWithHook<Dog>
  implements Template<FeedCommand, [LogCommand], Dog>
{
  execute(subject: Dog, object: { time: string }): FeedResult {
    this.log.run(subject, { action: "feed" });
    return { fed: true, food: "kibble", amount: 1 };
  }
}

// ── §14n proof — regression guard for CommandHooks with defaultResolver + free SU ──────────────────
//
// A hook Command that declares `defaultResolver` as a required property (not merely inheriting
// the optional base-class field) bypasses the CommandHooks coverage check even when SU is free.
// If the `Cmd extends { readonly defaultResolver: any }` conditional is removed from CommandHooks,
// this class produces TS2416 at `readonly sparseLog = new SparseCoverageLogCommand()` and breaks
// the build — making the regression visible.
//
// SparseCoverageLogCommand handles [Dog, Cat, Bird] but only declares resolveDog explicitly.
// resolveCat and resolveBird fall through to defaultResolver at runtime.

class SparseCoverageLogCommand extends Command<
  Person,
  { action: string },
  LogEntry,
  [Dog, Cat, Bird]
> {
  readonly commandName = "sparseCoverageLog" as const;
  private readonly entry = {
    execute: (s: Dog | Cat | Bird, o: { action: string }): LogEntry => ({
      action: o.action,
      subject: s.name,
    }),
  };
  readonly defaultResolver = this.entry;
  resolveDog() {
    return this.entry;
  }
  // resolveCat and resolveBird intentionally absent — defaultResolver handles them
}

abstract class FeedTemplateWithSparseHook<
  SU extends CommandSubjectUnion<FeedCommand>,
> implements Template<FeedCommand, [SparseCoverageLogCommand], SU> {
  readonly sparseCoverageLog = new SparseCoverageLogCommand(); // no TS2416 — defaultResolver opt-out
  abstract execute(subject: SU, object: { time: string }): FeedResult;
}

class DogFeedWithSparseHook
  extends FeedTemplateWithSparseHook<Dog>
  implements Template<FeedCommand, [SparseCoverageLogCommand], Dog>
{
  execute(subject: Dog, object: { time: string }): FeedResult {
    this.sparseCoverageLog.run(subject, { action: "feed" });
    return { fed: true, food: "kibble", amount: 1 };
  }
}

describe("§14 compile-time constraint tests", () => {
  // All constraints are verified at compile time by tsc --build (which includes
  // core.test.ts via tsconfig.json include: ["src"]). Each @ts-expect-error
  // block above proves the framework rejects the invalid usage — if the error
  // disappears, tsc fails. No runtime assertions are needed; compilation = proof.

  it("14a: missing resolver method rejected at call site", () => void 0);
  it("14b: unsupported subject rejected at call site", () => void 0);
  it("14c: template missing hook dependency (absent property) rejected at implements", () =>
    void 0);

  it("14d: hook-subject mismatch rejected at implements site", () => {
    // CatOnlyCommand only visits Cat (declares only resolveCat, not resolveDog).
    // Template<DogOnlyCommand, [CatOnlyCommand], Dog> requires the hook to cover
    // Dog (SU = Dog). CommandHooks checks that CatOnlyCommand has `resolveDog` —
    // it does not, so the hook property resolves to `never`. The @ts-expect-error
    // below proves the framework rejects the miswired hook at the implements site.
    class CatOnlyCommand extends Command<Person, string, string, [Cat]> {
      readonly commandName = "catOnly" as const;
      resolveCat() {
        return { execute: (s: Cat, o: string): string => "cat" };
      }
    }

    class MiswiredTemplate implements Template<DogOnlyCommand, [CatOnlyCommand], Dog> {
      // @ts-expect-error — CatOnlyCommand doesn't handle Dog (no resolveDog),
      // so CommandHooks resolves to { catOnly: "Error: hook Command does not declare resolver methods for all subjects in SU" }
      catOnly: CatOnlyCommand;
      constructor(c: CatOnlyCommand) {
        this.catOnly = c;
      }
      execute(subject: Dog, object: string): number {
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

    // Template works fine at runtime when it doesn't invoke the mismatched hook
    const cmd = new HookedDogCmd(new CatOnlyCommand());
    strictEqual(cmd.run(new Dog("Rex", "Lab"), "test"), 3);

    // Multi-subject variant: hook covers Dog and Cat but not Bird.
    // FeedCommand's full SU = Dog | Cat | Bird. CommandHooks checks for
    // resolveDog, resolveCat, resolveBird — the hook is missing resolveBird,
    // so the property resolves to the error string even though two of the
    // three subjects are covered.
    class DogCatHook extends Command<Person, { action: string }, LogEntry, [Dog, Cat]> {
      readonly commandName = "dogCatHook" as const;
      resolveDog() {
        return {
          execute: (s: Dog, o: { action: string }): LogEntry => ({
            action: o.action,
            subject: s.name,
          }),
        };
      }
      resolveCat() {
        return {
          execute: (s: Cat, o: { action: string }): LogEntry => ({
            action: o.action,
            subject: s.name,
          }),
        };
      }
      // resolveBird intentionally omitted
    }

    class MissingBirdHookTemplate implements Template<FeedCommand, [DogCatHook]> {
      // @ts-expect-error — DogCatHook is missing resolveBird; CommandHooks resolves
      // dogCatHook to "Error: hook Command does not declare resolver methods for all subjects in SU"
      dogCatHook: DogCatHook;
      constructor(h: DogCatHook) {
        this.dogCatHook = h;
      }
      execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
        return { fed: true, food: "seed", amount: 1 };
      }
    }

    void MissingBirdHookTemplate;
  });

  it("14e: non-literal resolverName — run() rejected at call site", () => void 0);
  it("14f: wrong return type from execute rejected at call site", () => void 0);
  it("14g: wrong object type in execute rejected at call site", () => void 0);
  it("14h: non-Subject in CSU tuple rejected", () => void 0);
  it("14i: duplicate resolverName — conflicting handlers rejected", () => void 0);

  it("14j: resolver method returning wrong-SU template rejected at call site", () => {
    // A resolver method declared to return Template<C, [], Dog> must return a Template
    // whose execute accepts Dog. Returning a Cat-scoped Template is a compile error
    // because execute<T extends Cat> is incompatible with execute<T extends Dog>.
    class WrongSUCommand extends Command<{}, string, string, [Dog, Cat]> {
      readonly commandName = "wrongSU" as const;
      resolveDog(d: Dog, o: string): Template<WrongSUCommand, [], Dog> {
        // @ts-expect-error — CatOnlyTemplate.execute<T extends Cat> is incompatible
        // with Template<WrongSUCommand, [], Dog> which requires execute<T extends Dog>
        return new CatOnlyTemplate();
      }
      resolveCat(c: Cat, o: string): Template<WrongSUCommand, [], Cat> {
        return new CatOnlyTemplate();
      }
    }

    class CatOnlyTemplate implements Template<WrongSUCommand, [], Cat> {
      execute(subject: Cat, object: string): string {
        return subject.name;
      }
    }

    void WrongSUCommand;
  });

  it("14k: non-literal commandName on hook — implements rejected (not silent)", () => {
    // When a hook Command declares commandName as the wide `string` type,
    // CommandName<Cmd> returns the WidenedCommandNameError string rather than `never`.
    // The hook property is then keyed by the error string, not silently dropped —
    // the Template's implements check fails with a readable compile error.
    class NonLiteralNameHook extends Command<Person, string, string, [Dog]> {
      readonly commandName: string = "log"; // non-literal — type is `string`, not `"log"`
      resolveDog() {
        return { execute: (s: Dog, o: string): string => "" };
      }
    }

    // @ts-expect-error — commandName is non-literal; hook property is keyed by the
    // WidenedCommandNameError string rather than "log", so this class is missing
    // the required property and fails the implements check.
    class BrokenHookTemplate implements Template<DogOnlyCommand, [NonLiteralNameHook], Dog> {
      readonly log: NonLiteralNameHook = new NonLiteralNameHook();
      execute(subject: Dog, object: string): number {
        return subject.name.length;
      }
    }

    void BrokenHookTemplate;
  });

  // ── §14l — proof class at module scope (compiled by tsc, no runtime logic needed) ──
  //
  // Abstract parameterized template with a hook and free SU.
  // Previously, `CommandHooks<[LogCommand], SU>` was a deferred conditional when SU was
  // free — `readonly log = new LogCommand()` produced TS2416 because TypeScript could not
  // resolve `LogCommand extends { [K in SU["resolverName"]]: any } ? LogCommand : "Error"`.
  // The intersection approach (`Cmd & { [K in SU["resolverName"] & string]: any }`) evaluates
  // using SU's constraint and correctly accepts LogCommand. This class is the regression guard.
  it("14l: hook on abstract parameterized template with free SU compiles", () => void 0);

  it("14m: under-coverage hook on abstract parameterized template rejected at implements", () => {
    // PartialHookCommand only handles [Cat] (no resolveDog, no resolveBird).
    // When used as a hook for Template<FeedCommand, [PartialHookCommand], SU> where
    // SU extends Dog|Cat|Bird, the intersection approach evaluates SU["resolverName"]
    // using SU's constraint = "resolveDog"|"resolveCat"|"resolveBird".
    // Required type: PartialHookCommand & { resolveDog:any; resolveCat:any; resolveBird:any }.
    // PartialHookCommand lacks resolveDog and resolveBird → TS2416 on the hook property.
    class PartialHookCommand extends Command<Person, string, string, [Cat]> {
      readonly commandName = "partialHook" as const;
      resolveCat() {
        return { execute: (_s: Cat, _o: string): string => "cat" };
      }
    }

    abstract class AbstractMiswiredTemplate<
      SU extends CommandSubjectUnion<FeedCommand>,
    > implements Template<FeedCommand, [PartialHookCommand], SU> {
      // @ts-expect-error — PartialHookCommand covers only [Cat]; SU's constraint
      // (Dog|Cat|Bird) requires resolveDog and resolveBird too. The intersection
      // PartialHookCommand & { resolveDog:any; resolveCat:any; resolveBird:any }
      // is not satisfied by PartialHookCommand → TS2416.
      readonly partialHook = new PartialHookCommand();
      abstract execute(subject: SU, object: { time: string }): FeedResult;
    }

    void AbstractMiswiredTemplate;
  });

  // ── §14n — proof classes at module scope (compiled by tsc, no runtime logic needed) ──
  //
  // Hook Command with required `defaultResolver` and partial explicit resolver coverage.
  // If the `Cmd extends { readonly defaultResolver: any }` conditional is removed from
  // CommandHooks, FeedTemplateWithSparseHook produces TS2416 at `sparseCoverageLog` and
  // breaks the build. Optional `defaultResolver?` (base-class inherited) does NOT trigger
  // the opt-out — only an explicitly required declaration does.
  it("14n: hook with required defaultResolver bypasses coverage check in parameterized template", () =>
    void 0);
});

// ═══════════════════════════════════════════════════════════════════
// §MC · MIDDLEWARE COMPILE-TIME CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════

// §MC1 — A concrete MiddlewareCommand missing a resolver method has an
// unsatisfied `this` constraint on its own `run()`.
{
  class IncompleteMiddleware extends MiddlewareCommand<object, Ctx, Res, [Rock, Gem]> {
    readonly commandName = "incomplete" as const;
    resolveRock(_: Rock, __: Readonly<Ctx>): MiddlewareTemplate<IncompleteMiddleware, any[], Rock> {
      return { execute: () => 0 };
    }
    // resolveGem intentionally omitted
  }
  const _mc1 = new IncompleteMiddleware();
  const _mc1_run = () => {
    // @ts-expect-error — resolveGem missing; run() this constraint unsatisfied
    _mc1.run(new Rock(1), { factor: 1 });
  };
}

// §MC1b — A complete MiddlewareCommand (all resolvers implemented) still has
// `run()` uncallable. MiddlewareTemplate's execute has a required 3rd `inner`
// parameter, making it incompatible with the 2-arg Template that
// CommandSubjectStrategies (the `this` constraint on `run()`) requires.
// Middleware is designed to intercept a chain, not to be invoked standalone.
{
  // TraceMiddleware (defined in fixtures above) is a complete middleware — both
  // resolveRock and resolveGem implemented, returning MiddlewareTemplate.
  const _mc1b = new TraceMiddleware("t", []);
  const _mc1b_run = () => {
    // @ts-expect-error — MiddlewareTemplate (3-arg execute) ≠ Template (2-arg);
    // CommandSubjectStrategies this-constraint on run() is unsatisfied even though
    // all resolver methods are present.
    _mc1b.run(new Rock(1), { factor: 1 });
  };
}

// §MC2 — A MiddlewareCommand typed for a structurally incompatible Command
// (different BSL) cannot be placed in another Command's middleware array.
{
  class OtherCommand extends Command<object, Ctx, Res, [Rock]> {
    readonly commandName = "other" as const;
    resolveRock(_: Rock, __: Readonly<Ctx>): Template<OtherCommand, any[], Rock> {
      return { execute: (s, o) => s.weight * o.factor };
    }
  }

  class OtherMiddleware extends MiddlewareCommand<object, Ctx, Res, [Rock]> {
    readonly commandName = "otherMw" as const;
    resolveRock(_: Rock, __: Readonly<Ctx>): MiddlewareTemplate<OtherMiddleware, any[], Rock> {
      return { execute: (s, o) => s.weight * o.factor };
    }
  }

  class _mc2Cmd extends MeasureCommand {
    // @ts-expect-error — MiddlewareCommand<..,[Rock]> missing resolveGem; doesn't cover [Rock,Gem]
    override get middleware() {
      return [new OtherMiddleware()];
    }
  }
}

describe("§MC middleware compile-time constraints", () => {
  it("MC1: MiddlewareCommand missing resolver makes its own run() uncallable", () => void 0);
  it("MC1b: complete MiddlewareCommand run() is still uncallable — MiddlewareTemplate (3-arg) incompatible with CommandSubjectStrategies (2-arg) this-constraint", () =>
    void 0);
  it("MC2: MiddlewareCommand for wrong Command type rejected in middleware array", () => void 0);

  it("14j5: MiddlewareCommand.run() is always uncallable (this: never)", () => {
    // run(this: never) applies regardless of whether resolver methods or defaultResolver
    // are present. A fully covered MiddlewareCommand is still uncallable via run().
    class CoveredMw extends MiddlewareCommand<Person, string, string, [Dog]> {
      readonly commandName = "coveredMw" as const;
      resolveDog(_d: Dog) {
        return {
          execute: (s: Dog, o: string, inner: Runnable<Dog, string, string>): string =>
            inner.run(s, o),
        };
      }
    }
    const cmd = new CoveredMw();
    const _14j5 = () => {
      // @ts-expect-error — MiddlewareCommand.run() is always uncallable (this: never)
      cmd.run(new Dog("Rex", "Lab"), "");
    };
    void _14j5;
  });

  it("14j6: MiddlewareCommand.defaultResolver accepts MiddlewareDefaultResolverTemplate (inner required)", () => {
    // MiddlewareCommand narrows defaultResolver? to MiddlewareDefaultResolverTemplate,
    // which surfaces inner as a required third argument in the execute signature.
    // MiddlewareDefaultResolverTemplate is a subtype of DefaultResolverTemplate via
    // parameter contravariance: never <: Runnable, so execute(s, o, inner: Runnable)
    // is assignable to execute(s, o, inner: never). No inner? or inner! needed.
    class DefMw extends MiddlewareCommand<Person, string, string, [Dog]> {
      readonly commandName = "defMw" as const;
      resolveDog(_d: Dog) {
        return {
          execute: (s: Dog, o: string, inner: Runnable<Dog, string, string>): string =>
            inner.run(s, o),
        };
      }
      override readonly defaultResolver = {
        execute: (s: Dog, o: string, inner: Runnable<Dog, string, string>): string =>
          inner.run(s, o),
      };
    }
    void DefMw;
  });

  it("14j9: MiddlewareTemplate<C,H,SU>-typed value is assignable to MiddlewareCommand.defaultResolver", () => {
    // Regression guard for the subtype chain:
    //   MiddlewareTemplate<C,H,SU>  →  MiddlewareDefaultResolverTemplate<O,R,SU>  →  DefaultResolverTemplate<O,R,SU>
    //
    // Unlike 14j6 (inline object literal, types inferred from context), this test uses an
    // explicitly typed MiddlewareTemplate<C,H,SU> variable. TypeScript must resolve
    // CommandObject<C> and CommandReturn<C> from the MiddlewareCommand subclass to verify
    // the assignment. Guards against:
    //   (1) CommandObject<C>/CommandReturn<C> regressing to `never` (e.g. from a constraint
    //       change on MiddlewareTemplate's C parameter)
    //   (2) DefaultResolverTemplate losing `inner: never`, which would break the subtype chain
    //   (3) inner becoming optional in MiddlewareDefaultResolverTemplate
    const catchAll: MiddlewareTemplate<TraceMiddleware, [], Rock | Gem> = {
      execute: (s: Rock | Gem, o: Ctx, inner: Runnable<Rock | Gem, Ctx, Res>): Res =>
        inner.run(s, o),
    };
    class TraceMwWithDefault extends TraceMiddleware {
      override readonly defaultResolver = catchAll; // must compile
    }
    void TraceMwWithDefault;
  });
});

// ═══════════════════════════════════════════════════════════════════
// §14 · COMPILE-TIME CONSTRAINT TESTS — defaultResolver
// (moved from resolver.test.ts)
// ═══════════════════════════════════════════════════════════════════

describe("§14 compile-time constraint tests — defaultResolver", () => {
  // All constraints are verified at compile time by tsc --build (which includes
  // resolver.test.ts via tsconfig.json include: ["src"]). Each @ts-expect-error
  // block above proves the framework rejects the invalid usage — if the error
  // disappears, tsc fails. No runtime assertions are needed; compilation = proof.

  it("14j2: defaultResolver present — run() callable without specific resolver methods", () => {
    // A Command that declares defaultResolver but no specific resolver methods
    // satisfies the run() this constraint via the defaultResolver branch of the union.
    class DefaultCmd extends Command<Person, string, string, [Dog, Cat]> {
      readonly commandName = "defaultCmd" as const;
      readonly defaultResolver = { execute: (s: Dog | Cat, _o: string): string => s.name };
    }

    void DefaultCmd;
    // If the above compiles without @ts-expect-error, the test passes.
    // The compile-time proof is that new DefaultCmd().run(new Dog(...), "") is typeable.
    const cmd = new DefaultCmd();
    cmd.run(new Dog("Rex", "Lab"), ""); // must compile
  });

  it("14j3: no resolver methods AND no defaultResolver — run() uncallable", () => {
    class EmptyCmd extends Command<Person, string, string, [Dog]> {
      readonly commandName = "emptyCmd" as const;
      // No resolveDog, no defaultResolver
    }

    const cmd = new EmptyCmd();
    const _14j3 = () => {
      // @ts-expect-error — neither CommandSubjectStrategies nor defaultResolver is satisfied
      cmd.run(new Dog("Rex", "Lab"), "");
    };
    void _14j3;
  });

  it("14j4: defaultResolver with wrong return type — compile error at implementation site", () => {
    // DefaultResolverResult requires { execute(subject, object): R }.
    // Returning a plain string (no execute method) must be rejected.
    class BadDefaultCmd extends Command<Person, string, string, [Dog]> {
      readonly commandName = "badDefault" as const;
      // @ts-expect-error — `string` is not assignable to DefaultResolverResult
      readonly defaultResolver = "not a template";
    }
    void BadDefaultCmd;
  });

  it("14j7: resolverName 'defaultResolver' is reserved — run() uncallable", () => {
    // ValidResolverNames produces ReservedResolverNameError for any Subject whose
    // resolverName is "defaultResolver", making run() uncallable at the call site.
    class ReservedSubject extends Subject {
      readonly resolverName = "defaultResolver" as const;
      constructor() {
        super();
      }
    }
    class ReservedCmd extends Command<Subject, string, string, [ReservedSubject]> {
      readonly commandName = "reservedCmd" as const;
    }
    const cmd = new ReservedCmd();
    const _14j7 = () => {
      // @ts-expect-error — resolverName 'defaultResolver' is reserved;
      // ValidResolverNames produces ReservedResolverNameError making run() uncallable.
      cmd.run(new ReservedSubject(), "");
    };
    void _14j7;
  });

  it("14j8: defaultResolver + wrong-typed resolver → run() uncallable", () => {
    // Partial<CommandSubjectStrategies> in the defaultResolver branch ensures any
    // specific resolver methods present on the class are still type-checked, even
    // when defaultResolver is declared. Without this intersection, the defaultResolver
    // branch would bypass all per-resolver type checking.
    class BadResolverCmd extends Command<Subject, string, string, [Dog, Cat]> {
      readonly commandName = "badResolverCmd" as const;
      readonly defaultResolver = { execute: (_s: Dog | Cat, _o: string): string => "" };
      resolveDog(_d: Dog) {
        // Returns wrong shape — missing execute method; run() must be uncallable.
        return { notATemplate: true };
      }
    }
    const cmd = new BadResolverCmd();
    const _14j8 = () => {
      // @ts-expect-error — resolveDog returns wrong type; even with defaultResolver,
      // Partial<CommandSubjectStrategies> requires any present resolver to be correctly typed.
      cmd.run(new Dog("Rex", "Lab"), "");
    };
    void _14j8;
  });
});
