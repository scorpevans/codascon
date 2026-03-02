import { it } from "vitest";
import {
  Command,
  Subject,
  type Template,
  type CommandObject,
  type CommandReturn,
  type CommandName,
  type SubjectVisitName,
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
// TEST FIXTURES — Subjects
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

// ═══════════════════════════════════════════════════════════════════
// TEST FIXTURES — Domain types
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// TEST FIXTURES — Commands
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// §1 · BASIC DISPATCH
// ═══════════════════════════════════════════════════════════════════

function testBasicDispatchDog() {
  const feed = new FeedCommand();
  const rex = new Dog("Rex", "Labrador");
  const result = feed.run(rex, { time: "morning" });

  strictEqual(result.fed, true);
  strictEqual(result.food, "large kibble");
  strictEqual(result.amount, 3);
  console.log("  ✓ Dog dispatch");
}

function testBasicDispatchCat() {
  const feed = new FeedCommand();
  const whiskers = new Cat("Whiskers", true);
  const result = feed.run(whiskers, { time: "evening" });

  strictEqual(result.fed, true);
  strictEqual(result.food, "indoor formula");
  strictEqual(result.amount, 1);
  console.log("  ✓ Cat dispatch");
}

function testBasicDispatchBird() {
  const feed = new FeedCommand();
  const tweety = new Bird("Tweety", true);
  const result = feed.run(tweety, { time: "noon" });

  strictEqual(result.fed, true);
  strictEqual(result.food, "seed mix");
  strictEqual(result.amount, 0.2);
  console.log("  ✓ Bird dispatch");
}

// ═══════════════════════════════════════════════════════════════════
// §2 · STRATEGY SELECTION — same subject, different data
// ═══════════════════════════════════════════════════════════════════

function testStrategyVariesBySubjectState() {
  const feed = new FeedCommand();

  const lab = new Dog("Buddy", "Labrador");
  const chihuahua = new Dog("Tiny", "Chihuahua");

  const r1 = feed.run(lab, { time: "morning" });
  const r2 = feed.run(chihuahua, { time: "morning" });

  strictEqual(r1.food, "large kibble");
  strictEqual(r1.amount, 3);
  strictEqual(r2.food, "small kibble");
  strictEqual(r2.amount, 1.5);
  console.log("  ✓ Strategy varies by subject state");
}

function testStrategyVariesByCatIndoor() {
  const feed = new FeedCommand();

  const indoor = new Cat("Mimi", true);
  const outdoor = new Cat("Tom", false);

  const r1 = feed.run(indoor, { time: "morning" });
  const r2 = feed.run(outdoor, { time: "morning" });

  strictEqual(r1.food, "indoor formula");
  strictEqual(r2.food, "outdoor mix");
  console.log("  ✓ Strategy varies by Cat indoor/outdoor");
}

function testFlightlessBirdNotFed() {
  const feed = new FeedCommand();
  const penguin = new Bird("Penny", false);
  const result = feed.run(penguin, { time: "morning" });

  strictEqual(result.fed, false);
  strictEqual(result.food, "pellets");
  console.log("  ✓ Flightless bird gets pellets, not fed");
}

// ═══════════════════════════════════════════════════════════════════
// §3 · MULTIPLE COMMANDS — same subjects, different operations
// ═══════════════════════════════════════════════════════════════════

function testGroomDog() {
  const groom = new GroomCommand();
  const clinic: Clinic = { name: "PetCare", hasEmergency: true };

  const poodle = new Dog("Fifi", "Poodle");
  const mutt = new Dog("Max", "Mixed");

  const r1 = groom.run(poodle, clinic);
  const r2 = groom.run(mutt, clinic);

  strictEqual(r1.groomed, true);
  strictEqual(r1.service, "full clip");
  strictEqual(r1.cost, 80);
  strictEqual(r2.service, "bath & brush");
  strictEqual(r2.cost, 40);
  console.log("  ✓ Groom Dog — breed-specific strategy");
}

function testGroomCat() {
  const groom = new GroomCommand();
  const clinic: Clinic = { name: "PetCare", hasEmergency: true };

  const indoor = new Cat("Luna", true);
  const outdoor = new Cat("Stray", false);

  const r1 = groom.run(indoor, clinic);
  const r2 = groom.run(outdoor, clinic);

  strictEqual(r1.groomed, true);
  strictEqual(r1.cost, 25);
  strictEqual(r2.groomed, false);
  strictEqual(r2.cost, 0);
  console.log("  ✓ Groom Cat — indoor vs outdoor");
}

// ═══════════════════════════════════════════════════════════════════
// §4 · STRATEGY AS REUSABLE CLASS
// ═══════════════════════════════════════════════════════════════════

class AlwaysFedStrategy {
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    return { fed: true, food: "universal blend", amount: 2 };
  }
}

class NeverFedStrategy {
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    return { fed: false, food: "none", amount: 0 };
  }
}

class UniformFeedCommand extends Command<Person, { time: string }, FeedResult, [Dog, Cat, Bird]> {
  readonly commandName = "uniformFeed" as const;
  resolveDog() {
    return new AlwaysFedStrategy();
  }
  resolveCat() {
    return new AlwaysFedStrategy();
  }
  resolveBird() {
    return new NeverFedStrategy();
  }
}

function testReusableStrategyClasses() {
  const cmd = new UniformFeedCommand();
  const rex = new Dog("Rex", "Lab");
  const whiskers = new Cat("Whiskers", true);
  const tweety = new Bird("Tweety", true);

  strictEqual(cmd.run(rex, { time: "am" }).food, "universal blend");
  strictEqual(cmd.run(whiskers, { time: "am" }).food, "universal blend");
  strictEqual(cmd.run(tweety, { time: "am" }).fed, false);
  console.log("  ✓ Reusable strategy classes shared across subjects");
}

// ═══════════════════════════════════════════════════════════════════
// §5 · PARAMETERIZED STRATEGIES
// ═══════════════════════════════════════════════════════════════════

class FixedPortionStrategy {
  constructor(
    private readonly food: string,
    private readonly amount: number,
  ) {}
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    return { fed: true, food: this.food, amount: this.amount };
  }
}

class DietFeedCommand extends Command<Person, { time: string }, FeedResult, [Dog, Cat, Bird]> {
  readonly commandName = "dietFeed" as const;
  resolveDog() {
    return new FixedPortionStrategy("diet kibble", 1.0);
  }
  resolveCat() {
    return new FixedPortionStrategy("diet wet food", 0.5);
  }
  resolveBird() {
    return new FixedPortionStrategy("diet seeds", 0.1);
  }
}

function testParameterizedStrategies() {
  const cmd = new DietFeedCommand();

  strictEqual(cmd.run(new Dog("D", "Lab"), { time: "am" }).amount, 1.0);
  strictEqual(cmd.run(new Cat("C", true), { time: "am" }).amount, 0.5);
  strictEqual(cmd.run(new Bird("B", true), { time: "am" }).amount, 0.1);
  console.log("  ✓ Parameterized strategies with constructor args");
}

// ═══════════════════════════════════════════════════════════════════
// §6 · VISITOR USES SUBJECT + OBJECT TO SELECT STRATEGY
// ═══════════════════════════════════════════════════════════════════

class TimeAwareFeedCommand extends Command<Person, { time: string }, FeedResult, [Dog, Cat]> {
  readonly commandName = "timeAwareFeed" as const;

  resolveDog(dog: Dog, obj: Readonly<{ time: string }>) {
    if (obj.time === "morning") return new FixedPortionStrategy("breakfast kibble", 2);
    return new FixedPortionStrategy("dinner kibble", 1.5);
  }

  resolveCat(cat: Cat, obj: Readonly<{ time: string }>) {
    if (obj.time === "morning" && cat.indoor)
      return new FixedPortionStrategy("indoor breakfast", 0.8);
    return new FixedPortionStrategy("standard", 1);
  }
}

function testVisitorUsesObjectToSelect() {
  const cmd = new TimeAwareFeedCommand();
  const dog = new Dog("Rex", "Lab");

  const morning = cmd.run(dog, { time: "morning" });
  const evening = cmd.run(dog, { time: "evening" });

  strictEqual(morning.food, "breakfast kibble");
  strictEqual(morning.amount, 2);
  strictEqual(evening.food, "dinner kibble");
  strictEqual(evening.amount, 1.5);
  console.log("  ✓ Visitor uses both subject and object for selection");
}

function testVisitorUsesBothSubjectAndObject() {
  const cmd = new TimeAwareFeedCommand();

  const indoorMorning = cmd.run(new Cat("Mi", true), { time: "morning" });
  const outdoorMorning = cmd.run(new Cat("To", false), { time: "morning" });

  strictEqual(indoorMorning.food, "indoor breakfast");
  strictEqual(outdoorMorning.food, "standard");
  console.log("  ✓ Visitor combines subject state + object for selection");
}

// ═══════════════════════════════════════════════════════════════════
// §7 · ASYNC SUPPORT
// ═══════════════════════════════════════════════════════════════════

class AsyncFeedCommand extends Command<Person, { time: string }, Promise<FeedResult>, [Dog, Cat]> {
  readonly commandName = "asyncFeed" as const;

  resolveDog(dog: Dog, obj: Readonly<{ time: string }>) {
    return {
      execute: async (subject: Dog, object: { time: string }): Promise<FeedResult> => {
        // Simulate async work
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

async function testAsyncCommand() {
  const cmd = new AsyncFeedCommand();
  const result = await cmd.run(new Dog("Rex", "Lab"), { time: "am" });

  strictEqual(result.fed, true);
  strictEqual(result.food, "async kibble");
  console.log("  ✓ Async command returns Promise<FeedResult>");
}

async function testAsyncCat() {
  const cmd = new AsyncFeedCommand();
  const result = await cmd.run(new Cat("Mimi", true), { time: "pm" });

  strictEqual(result.food, "async wet food");
  console.log("  ✓ Async dispatch to Cat");
}

// ═══════════════════════════════════════════════════════════════════
// §8 · TEMPLATE WITH COMMAND HOOKS
// ═══════════════════════════════════════════════════════════════════

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

// A template that uses hooks — feed triggers a log
class LoggingFeedStrategy implements Template<FeedCommand, [LogCommand]> {
  log: LogCommand;
  constructor(log: LogCommand) {
    this.log = log;
  }
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    // Use the hook
    const entry = this.log.run(subject, { action: "feed" });
    return {
      fed: true,
      food: `logged(${entry.subject}):universal`,
      amount: 1,
    };
  }
}

class LoggingFeedCommand extends Command<Person, { time: string }, FeedResult, [Dog, Cat, Bird]> {
  readonly commandName = "loggingFeed" as const;
  private logCmd: LogCommand;
  constructor(logCmd: LogCommand) {
    super();
    this.logCmd = logCmd;
  }

  resolveDog() {
    return new LoggingFeedStrategy(this.logCmd);
  }
  resolveCat() {
    return new LoggingFeedStrategy(this.logCmd);
  }
  resolveBird() {
    return new LoggingFeedStrategy(this.logCmd);
  }
}

function testTemplateWithHooks() {
  const logCmd = new LogCommand();
  const cmd = new LoggingFeedCommand(logCmd);

  const result = cmd.run(new Dog("Rex", "Lab"), { time: "am" });
  strictEqual(result.fed, true);
  strictEqual(result.food, "logged(Rex):universal");
  console.log("  ✓ Template with command hooks invokes hooked command");
}

function testTemplateHooksDifferentSubjects() {
  const logCmd = new LogCommand();
  const cmd = new LoggingFeedCommand(logCmd);

  const r1 = cmd.run(new Dog("Rex", "Lab"), { time: "am" });
  const r2 = cmd.run(new Cat("Mimi", true), { time: "am" });
  const r3 = cmd.run(new Bird("Tweety", true), { time: "am" });

  strictEqual(r1.food, "logged(Rex):universal");
  strictEqual(r2.food, "logged(Mimi):universal");
  strictEqual(r3.food, "logged(Tweety):universal");
  console.log("  ✓ Hooked template dispatches correctly per subject");
}

// ═══════════════════════════════════════════════════════════════════
// §9 · COMMAND PRESERVES `this` IN VISIT METHODS
// ═══════════════════════════════════════════════════════════════════

class StatefulFeedCommand extends Command<Person, { time: string }, FeedResult, [Dog, Cat]> {
  readonly commandName = "statefulFeed" as const;
  private feedCount = 0;
  private getNextCount() {
    return ++this.feedCount;
  }

  resolveDog(dog: Dog) {
    const count = this.getNextCount();
    return {
      execute: (s: Dog, o: { time: string }): FeedResult => ({
        fed: true,
        food: `feed#${count}`,
        amount: 1,
      }),
    };
  }

  resolveCat(cat: Cat) {
    const count = this.getNextCount();
    return {
      execute: (s: Cat, o: { time: string }): FeedResult => ({
        fed: true,
        food: `feed#${count}`,
        amount: 1,
      }),
    };
  }
}

function testCommandThisPreserved() {
  const cmd = new StatefulFeedCommand();

  const r1 = cmd.run(new Dog("A", "Lab"), { time: "am" });
  const r2 = cmd.run(new Cat("B", true), { time: "am" });
  const r3 = cmd.run(new Dog("C", "Pug"), { time: "pm" });

  strictEqual(r1.food, "feed#1");
  strictEqual(r2.food, "feed#2");
  strictEqual(r3.food, "feed#3");
  console.log("  ✓ Command `this` preserved — stateful visit methods work");
}

// ═══════════════════════════════════════════════════════════════════
// §10 · COMMAND.RUN OVERRIDING
// ═══════════════════════════════════════════════════════════════════

class AuditedFeedCommand extends Command<Person, { time: string }, FeedResult, [Dog, Cat]> {
  readonly commandName = "auditedFeed" as const;
  public auditLog: string[] = [];

  resolveDog() {
    return new FixedPortionStrategy("kibble", 2);
  }
  resolveCat() {
    return new FixedPortionStrategy("wet food", 1);
  }

  override run<T extends Dog | Cat>(subject: T, object: { time: string }): FeedResult {
    this.auditLog.push(`${subject.visitName}:${subject.name}@${object.time}`);
    return super.run(subject, object);
  }
}

function testRunOverride() {
  const cmd = new AuditedFeedCommand();

  cmd.run(new Dog("Rex", "Lab"), { time: "morning" });
  cmd.run(new Cat("Mimi", true), { time: "evening" });

  deepEqual(cmd.auditLog, ["resolveDog:Rex@morning", "resolveCat:Mimi@evening"]);
  console.log("  ✓ Command.run can be overridden with super.run()");
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

function testTypeLevelAssertions() {
  // If this file compiles, all type assertions pass.
  console.log("  ✓ All type-level assertions pass (compilation = proof)");
}

// ═══════════════════════════════════════════════════════════════════
// §12 · EDGE CASES
// ═══════════════════════════════════════════════════════════════════

// Single-subject command
class DogOnlyCommand extends Command<Person, string, number, [Dog]> {
  readonly commandName = "dogOnly" as const;
  resolveDog(dog: Dog, obj: Readonly<string>) {
    return {
      execute: (s: Dog, o: string): number => s.name.length + o.length,
    };
  }
}

function testSingleSubjectCommand() {
  const cmd = new DogOnlyCommand();
  const result = cmd.run(new Dog("Rex", "Lab"), "hello");
  strictEqual(result, 8); // "Rex" (3) + "hello" (5)
  console.log("  ✓ Single-subject command works");
}

// Primitive object type
class PrimObjCommand extends Command<Person, number, string, [Dog, Cat]> {
  readonly commandName = "primObj" as const;
  resolveDog(d: Dog, n: Readonly<number>) {
    return {
      execute: (s: Dog, o: number): string => `${s.name}:${o}`,
    };
  }
  resolveCat(c: Cat, n: Readonly<number>) {
    return {
      execute: (s: Cat, o: number): string => `${s.name}:${o * 2}`,
    };
  }
}

function testPrimitiveObjectType() {
  const cmd = new PrimObjCommand();
  strictEqual(cmd.run(new Dog("Rex", "Lab"), 5), "Rex:5");
  strictEqual(cmd.run(new Cat("Mimi", true), 5), "Mimi:10");
  console.log("  ✓ Primitive (number) as object type");
}

// Void return type
class VoidCommand extends Command<Person, string, void, [Dog]> {
  readonly commandName = "voidCmd" as const;
  public sideEffect = "";
  resolveDog(d: Dog) {
    const self = this;
    return {
      execute: (s: Dog, o: string): void => {
        self.sideEffect = `${s.name}:${o}`;
      },
    };
  }
}

function testVoidReturnType() {
  const cmd = new VoidCommand();
  cmd.run(new Dog("Rex", "Lab"), "action");
  strictEqual(cmd.sideEffect, "Rex:action");
  console.log("  ✓ Void return type — side effect only");
}

// Same strategy instance returned for different calls
class SharedStrategyCommand extends Command<Person, string, string, [Dog, Cat]> {
  readonly commandName = "shared" as const;
  private readonly sharedStrategy = {
    execute: (s: Dog | Cat, o: string): string => `${s.visitName}:${s.name}:${o}`,
  };
  resolveDog() {
    return this.sharedStrategy;
  }
  resolveCat() {
    return this.sharedStrategy;
  }
}

function testSharedStrategyInstance() {
  const cmd = new SharedStrategyCommand();
  strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "resolveDog:Rex:x");
  strictEqual(cmd.run(new Cat("Mimi", true), "y"), "resolveCat:Mimi:y");
  console.log("  ✓ Shared strategy instance across subjects");
}

// ═══════════════════════════════════════════════════════════════════
// §13 · MULTIPLE COMMANDS ON SAME SUBJECT SET
// ═══════════════════════════════════════════════════════════════════

function testMultipleCommandsSameSubjects() {
  const feed = new FeedCommand();
  const groom = new GroomCommand();
  const clinic: Clinic = { name: "Vet", hasEmergency: false };

  const dog = new Dog("Rex", "Poodle");

  const feedResult = feed.run(dog, { time: "morning" });
  const groomResult = groom.run(dog, clinic);

  strictEqual(feedResult.food, "small kibble");
  strictEqual(groomResult.service, "full clip");
  console.log("  ✓ Same subject dispatched through different commands");
}

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
//   This test verifies enforcement at the invocation site (the stronger check).

function testHookSubjectMismatchAtInvocation() {
  class CatOnlyCommand extends Command<Person, string, string, [Cat]> {
    readonly commandName = "catOnly" as const;
    resolveCat() {
      return { execute: (s: Cat, o: string): string => "cat" };
    }
  }

  // CatOnlyCommand only visits Cat, but we wire it as a hook into a
  // Dog template.  Structurally valid: the template has `catOnly` property
  // satisfying CommandHooks<[CatOnlyCommand]>.
  class MiswiredTemplate implements Template<DogOnlyCommand, [CatOnlyCommand], Dog> {
    catOnly: CatOnlyCommand;
    constructor(c: CatOnlyCommand) {
      this.catOnly = c;
    }
    execute(subject: Dog, object: string): number {
      // If we tried to invoke the hook on the wrong subject:
      //   this.catOnly.run(subject, "data")
      // TypeScript catches it — Dog is not assignable to Cat (the hook's subject union).
      return subject.name.length;
    }
  }

  // Template works fine when it doesn't invoke the mismatched hook
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
  const cmd = new HookedDogCmd(new CatOnlyCommand());
  strictEqual(cmd.run(new Dog("Rex", "Lab"), "test"), 3);

  console.log("  ✓ 14d: Hook-subject mismatch caught at hook invocation site");
}

// Compile-time proof: invoking the hook on the wrong subject errors
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

function testCompileTimeConstraints() {
  console.log("  ✓ 14a: Missing visit method rejected at call site");
  console.log("  ✓ 14b: Unsupported subject rejected at call site");
  console.log("  ✓ 14c: Template missing hook dependency rejected at implements");
  testHookSubjectMismatchAtInvocation();
  console.log("  ✓ 14e: Non-literal visitName — run() rejected at call site");
  console.log("  ✓ 14f: Wrong return type from execute rejected at call site");
  console.log("  ✓ 14g: Wrong object type in execute rejected at call site");
  console.log("  ✓ 14h: Non-Subject in CSU tuple rejected");
  console.log("  ✓ 14i: Duplicate visitName — conflicting handlers rejected");
}

// ═══════════════════════════════════════════════════════════════════
// §15 · NESTED COMMAND HOOKS — end-to-end runtime
// ═══════════════════════════════════════════════════════════════════

class ExportTemplate implements Template<ExportCommand, [FeedCommand], Dog | Cat> {
  feed: FeedCommand;
  constructor(feed: FeedCommand) {
    this.feed = feed;
  }

  execute(subject: Dog | Cat, object: { format: string }): string {
    const feedResult = this.feed.run(subject, { time: "export" });
    return `[${object.format}] ${subject.visitName}:${subject.name} → ${feedResult.food}`;
  }
}

class ExportCommand extends Command<Person, { format: string }, string, [Dog, Cat]> {
  readonly commandName = "export" as const;
  private feedCmd: FeedCommand;
  constructor(feedCmd: FeedCommand) {
    super();
    this.feedCmd = feedCmd;
  }

  resolveDog() {
    return new ExportTemplate(this.feedCmd);
  }
  resolveCat() {
    return new ExportTemplate(this.feedCmd);
  }
}

function testNestedHookExecution() {
  const feedCmd = new FeedCommand();
  const exportCmd = new ExportCommand(feedCmd);

  const r1 = exportCmd.run(new Dog("Rex", "Labrador"), { format: "CSV" });
  const r2 = exportCmd.run(new Cat("Mimi", true), { format: "JSON" });

  strictEqual(r1, "[CSV] resolveDog:Rex → large kibble");
  strictEqual(r2, "[JSON] resolveCat:Mimi → indoor formula");
  console.log("  ✓ Nested hook: export template invokes feed command");
}

function testNestedHookDifferentStrategies() {
  const feedCmd = new FeedCommand();
  const exportCmd = new ExportCommand(feedCmd);

  const lab = exportCmd.run(new Dog("Buddy", "Labrador"), { format: "XML" });
  const chi = exportCmd.run(new Dog("Tiny", "Chihuahua"), { format: "XML" });

  strictEqual(lab, "[XML] resolveDog:Buddy → large kibble");
  strictEqual(chi, "[XML] resolveDog:Tiny → small kibble");
  console.log("  ✓ Nested hook: underlying strategy selection preserved through hooks");
}

function testNestedHookChaining() {
  // Three-level chain: AuditExport → Export → Feed
  class AuditExportTemplate implements Template<AuditExportCommand, [ExportCommand], Dog> {
    export: ExportCommand;
    constructor(exportCmd: ExportCommand) {
      this.export = exportCmd;
    }

    execute(subject: Dog, object: { format: string }): string {
      const exported = this.export.run(subject, object);
      return `[AUDIT] ${exported}`;
    }
  }

  class AuditExportCommand extends Command<Person, { format: string }, string, [Dog]> {
    readonly commandName = "auditExport" as const;
    private exportCmd: ExportCommand;
    constructor(exportCmd: ExportCommand) {
      super();
      this.exportCmd = exportCmd;
    }

    resolveDog() {
      return new AuditExportTemplate(this.exportCmd);
    }
  }

  const feedCmd = new FeedCommand();
  const exportCmd = new ExportCommand(feedCmd);
  const auditCmd = new AuditExportCommand(exportCmd);

  const result = auditCmd.run(new Dog("Rex", "Labrador"), { format: "CSV" });
  strictEqual(result, "[AUDIT] [CSV] resolveDog:Rex → large kibble");
  console.log("  ✓ Three-level hook chain: audit → export → feed");
}

// ═══════════════════════════════════════════════════════════════════
// §16 · DOCUMENT DOMAIN — second independent domain validation
//
//   A completely separate domain (TextNode/ImageNode/RenderCommand)
//   exercises the same framework paths with different types, proving
//   the framework is domain-agnostic.
// ═══════════════════════════════════════════════════════════════════

// ── Subjects ─────────────────────────────────────────────────────

class TextNode extends Subject {
  readonly visitName = "resolveTextNode" as const;
  constructor(public readonly text: string) {
    super();
  }
}

class ImageNode extends Subject {
  readonly visitName = "resolveImageNode" as const;
  constructor(public readonly url: string) {
    super();
  }
}

type AppContext = { theme: string };

// ── Templates ────────────────────────────────────────────────────

class TextRenderTemplate implements Template<RenderCommand, [], TextNode> {
  execute(subject: TextNode, object: AppContext): string {
    return `<span class="${object.theme}">${subject.text}</span>`;
  }
}

class DocExportTextTemplate implements Template<DocExportCommand, [RenderCommand], TextNode> {
  // CommandHooks<[RenderCommand]> requires this property
  constructor(public readonly render: RenderCommand) {}

  execute(subject: TextNode, object: AppContext): string {
    const rendered = this.render.run(subject, object);
    return `[EXPORTED] ${rendered}`;
  }
}

// ── Commands ─────────────────────────────────────────────────────

class RenderCommand extends Command<Subject, AppContext, string, [TextNode, ImageNode]> {
  readonly commandName = "render" as const;

  resolveTextNode(subject: TextNode, object: Readonly<AppContext>) {
    return new TextRenderTemplate();
  }

  resolveImageNode(subject: ImageNode, object: Readonly<AppContext>) {
    return {
      execute(subj: ImageNode, obj: AppContext) {
        return `<img src="${subj.url}" class="${obj.theme}" />`;
      },
    };
  }
}

class DocExportCommand extends Command<Subject, AppContext, string, [TextNode]> {
  readonly commandName = "docExport" as const;
  constructor(public readonly render: RenderCommand) {
    super();
  }

  resolveTextNode(subject: TextNode, object: Readonly<AppContext>) {
    return new DocExportTextTemplate(this.render);
  }
}

// ── 16a. Runtime: double-dispatch routes to correct template ─────

function testDocDomainDoubleDispatch() {
  const ctx: AppContext = { theme: "dark-mode" };
  const renderCmd = new RenderCommand();

  const textResult = renderCmd.run(new TextNode("Hello World"), ctx);
  const imageResult = renderCmd.run(new ImageNode("hero.png"), ctx);

  strictEqual(textResult, '<span class="dark-mode">Hello World</span>');
  strictEqual(imageResult, '<img src="hero.png" class="dark-mode" />');
  console.log("  ✓ Double-dispatch routes TextNode and ImageNode to correct templates");
}

// ── 16b. Runtime: this context preserved + nested command hooks ──

function testDocDomainNestedHooks() {
  const ctx: AppContext = { theme: "dark-mode" };
  const renderCmd = new RenderCommand();
  const exportCmd = new DocExportCommand(renderCmd);

  const result = exportCmd.run(new TextNode("Nested Context"), ctx);
  strictEqual(result, '[EXPORTED] <span class="dark-mode">Nested Context</span>');
  console.log("  ✓ Nested hook: DocExportCommand → RenderCommand via template DI");
}

// ── 16c. Compile: missing visit method on RenderCommand variant ──

{
  class IncompleteRenderCommand extends Command<
    Subject,
    AppContext,
    string,
    [TextNode, ImageNode]
  > {
    readonly commandName = "incompleteRender" as const;
    resolveTextNode() {
      return new TextRenderTemplate();
    }
    // resolveImageNode intentionally missing
  }
  const cmd = new IncompleteRenderCommand();
  const _16c = () => {
    // @ts-expect-error — `this` constraint unsatisfied: resolveImageNode missing
    cmd.run(new TextNode("x"), { theme: "light" });
  };
}

// ── 16d. Compile: executing command on unsupported subject ───────

{
  const exportCmd = new DocExportCommand(new RenderCommand());
  const _16d = () => {
    // @ts-expect-error — DocExportCommand only visits [TextNode], ImageNode not in union
    exportCmd.run(new ImageNode("hero.png"), { theme: "light" });
  };
}

// ── 16e. Compile: structural DI enforcement — missing hook prop ──

{
  // @ts-expect-error — Property 'render' is missing in type 'IncompleteExportTemplate'
  // but required in type 'CommandHooks<[RenderCommand]>'
  class IncompleteExportTemplate implements Template<DocExportCommand, [RenderCommand], TextNode> {
    execute(subject: TextNode, object: AppContext): string {
      return "Fail";
    }
  }
}

// ── 16f. Compile: hook that doesn't support target subject ───────
//
//   ImageOnlyCommand only visits ImageNode, but we try to use it as
//   a hook for a TextNode template.  The structural `implements` check
//   passes (it just requires `imageOnly: ImageOnlyCommand` property),
//   but the semantic error surfaces at the invocation site — you can't
//   call imageOnly.run(textNode, ...) because TextNode isn't in
//   ImageOnlyCommand's subject union.

{
  class ImageOnlyCommand extends Command<Subject, AppContext, string, [ImageNode]> {
    readonly commandName = "imageOnly" as const;
    resolveImageNode() {
      return { execute: () => "img" };
    }
  }

  class TextCommandWithImageHook extends Command<Subject, AppContext, string, [TextNode]> {
    readonly commandName = "textWithImageHook" as const;
    private imgCmd: ImageOnlyCommand;
    constructor(imgCmd: ImageOnlyCommand) {
      super();
      this.imgCmd = imgCmd;
    }

    resolveTextNode() {
      return {
        imageOnly: this.imgCmd,
        execute: (subject: TextNode, object: AppContext): string => {
          // If we tried: this.imgCmd.run(subject, object)
          // TypeScript would error — TextNode not in ImageOnlyCommand's union.
          return subject.text;
        },
      } satisfies Template<TextCommandWithImageHook, [ImageOnlyCommand], TextNode>;
    }
  }

  // The command itself runs fine because execute doesn't invoke the bad hook
  const cmd = new TextCommandWithImageHook(new ImageOnlyCommand());
  const imgCmd = new ImageOnlyCommand();

  // But directly calling the hook on the wrong subject type is caught:
  const _16f = () => {
    // @ts-expect-error — TextNode is not assignable to ImageNode
    imgCmd.run(new TextNode("oops"), { theme: "x" });
  };
}

function testDocDomainCompileTimeConstraints() {
  console.log("  ✓ 16c: Missing resolveImageNode rejected at call site");
  console.log("  ✓ 16d: ImageNode rejected by TextNode-only DocExportCommand");
  console.log("  ✓ 16e: Template missing hook `render` property rejected at implements");
  console.log("  ✓ 16f: Hook invoked on wrong subject rejected at call site");
}

// ═══════════════════════════════════════════════════════════════════
// §17 · RUN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n§1 Basic dispatch");
  testBasicDispatchDog();
  testBasicDispatchCat();
  testBasicDispatchBird();

  console.log("\n§2 Strategy selection");
  testStrategyVariesBySubjectState();
  testStrategyVariesByCatIndoor();
  testFlightlessBirdNotFed();

  console.log("\n§3 Multiple commands");
  testGroomDog();
  testGroomCat();

  console.log("\n§4 Reusable strategies");
  testReusableStrategyClasses();

  console.log("\n§5 Parameterized strategies");
  testParameterizedStrategies();

  console.log("\n§6 Visitor uses subject + object");
  testVisitorUsesObjectToSelect();
  testVisitorUsesBothSubjectAndObject();

  console.log("\n§7 Async support");
  await testAsyncCommand();
  await testAsyncCat();

  console.log("\n§8 Template with hooks");
  testTemplateWithHooks();
  testTemplateHooksDifferentSubjects();

  console.log("\n§9 Command this preservation");
  testCommandThisPreserved();

  console.log("\n§10 Command.run override");
  testRunOverride();

  console.log("\n§11 Type-level assertions");
  testTypeLevelAssertions();

  console.log("\n§12 Edge cases");
  testSingleSubjectCommand();
  testPrimitiveObjectType();
  testVoidReturnType();
  testSharedStrategyInstance();

  console.log("\n§13 Multiple commands, same subjects");
  testMultipleCommandsSameSubjects();

  console.log("\n§14 Compile-time constraints");
  testCompileTimeConstraints();

  console.log("\n§15 Nested command hooks");
  testNestedHookExecution();
  testNestedHookDifferentStrategies();
  testNestedHookChaining();

  console.log("\n§16 Document domain — second domain validation");
  testDocDomainDoubleDispatch();
  testDocDomainNestedHooks();
  testDocDomainCompileTimeConstraints();

  console.log("\n══════════════════════════════════════════");
  console.log("  All tests passed.");
  console.log("══════════════════════════════════════════\n");
}

it("codascon full test suite", async () => {
  await main();
});
