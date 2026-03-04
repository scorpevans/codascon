import { describe, it } from "vitest";
import { Command, Subject, type Template } from "./index.js";

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

describe("§1 basic dispatch", () => {
  it("dispatches to Dog", () => {
    const feed = new FeedCommand();
    const rex = new Dog("Rex", "Labrador");
    const result = feed.run(rex, { time: "morning" });

    strictEqual(result.fed, true);
    strictEqual(result.food, "large kibble");
    strictEqual(result.amount, 3);
  });

  it("dispatches to Cat", () => {
    const feed = new FeedCommand();
    const whiskers = new Cat("Whiskers", true);
    const result = feed.run(whiskers, { time: "evening" });

    strictEqual(result.fed, true);
    strictEqual(result.food, "indoor formula");
    strictEqual(result.amount, 1);
  });

  it("dispatches to Bird", () => {
    const feed = new FeedCommand();
    const tweety = new Bird("Tweety", true);
    const result = feed.run(tweety, { time: "noon" });

    strictEqual(result.fed, true);
    strictEqual(result.food, "seed mix");
    strictEqual(result.amount, 0.2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// §2 · STRATEGY SELECTION — same subject, different data
// ═══════════════════════════════════════════════════════════════════

describe("§2 strategy selection — same subject, different data", () => {
  it("strategy varies by Dog breed", () => {
    const feed = new FeedCommand();

    const lab = new Dog("Buddy", "Labrador");
    const chihuahua = new Dog("Tiny", "Chihuahua");

    const r1 = feed.run(lab, { time: "morning" });
    const r2 = feed.run(chihuahua, { time: "morning" });

    strictEqual(r1.food, "large kibble");
    strictEqual(r1.amount, 3);
    strictEqual(r2.food, "small kibble");
    strictEqual(r2.amount, 1.5);
  });

  it("strategy varies by Cat indoor/outdoor", () => {
    const feed = new FeedCommand();

    const indoor = new Cat("Mimi", true);
    const outdoor = new Cat("Tom", false);

    const r1 = feed.run(indoor, { time: "morning" });
    const r2 = feed.run(outdoor, { time: "morning" });

    strictEqual(r1.food, "indoor formula");
    strictEqual(r2.food, "outdoor mix");
  });

  it("flightless Bird gets pellets and is not fed", () => {
    const feed = new FeedCommand();
    const penguin = new Bird("Penny", false);
    const result = feed.run(penguin, { time: "morning" });

    strictEqual(result.fed, false);
    strictEqual(result.food, "pellets");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §3 · MULTIPLE COMMANDS — same subjects, different operations
// ═══════════════════════════════════════════════════════════════════

describe("§3 multiple commands — same subjects, different operations", () => {
  it("GroomCommand dispatches to Dog with breed-specific strategy", () => {
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
  });

  it("GroomCommand dispatches to Cat — indoor vs outdoor", () => {
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
  });
});

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

describe("§4 strategy as reusable class", () => {
  it("reusable strategy class instances shared across subjects", () => {
    const cmd = new UniformFeedCommand();
    const rex = new Dog("Rex", "Lab");
    const whiskers = new Cat("Whiskers", true);
    const tweety = new Bird("Tweety", true);

    strictEqual(cmd.run(rex, { time: "am" }).food, "universal blend");
    strictEqual(cmd.run(whiskers, { time: "am" }).food, "universal blend");
    strictEqual(cmd.run(tweety, { time: "am" }).fed, false);
  });
});

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

describe("§5 parameterized strategies", () => {
  it("strategies with constructor args produce per-subject portions", () => {
    const cmd = new DietFeedCommand();

    strictEqual(cmd.run(new Dog("D", "Lab"), { time: "am" }).amount, 1.0);
    strictEqual(cmd.run(new Cat("C", true), { time: "am" }).amount, 0.5);
    strictEqual(cmd.run(new Bird("B", true), { time: "am" }).amount, 0.1);
  });
});

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

describe("§6 visitor uses subject + object to select strategy", () => {
  it("object (time) changes strategy for Dog", () => {
    const cmd = new TimeAwareFeedCommand();
    const dog = new Dog("Rex", "Lab");

    const morning = cmd.run(dog, { time: "morning" });
    const evening = cmd.run(dog, { time: "evening" });

    strictEqual(morning.food, "breakfast kibble");
    strictEqual(morning.amount, 2);
    strictEqual(evening.food, "dinner kibble");
    strictEqual(evening.amount, 1.5);
  });

  it("visitor combines subject state (indoor) with object (time) for Cat", () => {
    const cmd = new TimeAwareFeedCommand();

    const indoorMorning = cmd.run(new Cat("Mi", true), { time: "morning" });
    const outdoorMorning = cmd.run(new Cat("To", false), { time: "morning" });

    strictEqual(indoorMorning.food, "indoor breakfast");
    strictEqual(outdoorMorning.food, "standard");
  });
});

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

describe("§7 async support", () => {
  it("command returns Promise<FeedResult> for Dog", async () => {
    const cmd = new AsyncFeedCommand();
    const result = await cmd.run(new Dog("Rex", "Lab"), { time: "am" });

    strictEqual(result.fed, true);
    strictEqual(result.food, "async kibble");
  });

  it("async dispatch works for Cat", async () => {
    const cmd = new AsyncFeedCommand();
    const result = await cmd.run(new Cat("Mimi", true), { time: "pm" });

    strictEqual(result.food, "async wet food");
  });
});

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

describe("§8 template with command hooks", () => {
  it("template with hook invokes hooked command", () => {
    const logCmd = new LogCommand();
    const cmd = new LoggingFeedCommand(logCmd);

    const result = cmd.run(new Dog("Rex", "Lab"), { time: "am" });
    strictEqual(result.fed, true);
    strictEqual(result.food, "logged(Rex):universal");
  });

  it("hooked template dispatches correctly per subject", () => {
    const logCmd = new LogCommand();
    const cmd = new LoggingFeedCommand(logCmd);

    const r1 = cmd.run(new Dog("Rex", "Lab"), { time: "am" });
    const r2 = cmd.run(new Cat("Mimi", true), { time: "am" });
    const r3 = cmd.run(new Bird("Tweety", true), { time: "am" });

    strictEqual(r1.food, "logged(Rex):universal");
    strictEqual(r2.food, "logged(Mimi):universal");
    strictEqual(r3.food, "logged(Tweety):universal");
  });
});

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

describe("§9 command preserves `this` in visit methods", () => {
  it("stateful visit methods access command instance correctly", () => {
    const cmd = new StatefulFeedCommand();

    const r1 = cmd.run(new Dog("A", "Lab"), { time: "am" });
    const r2 = cmd.run(new Cat("B", true), { time: "am" });
    const r3 = cmd.run(new Dog("C", "Pug"), { time: "pm" });

    strictEqual(r1.food, "feed#1");
    strictEqual(r2.food, "feed#2");
    strictEqual(r3.food, "feed#3");
  });
});

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

describe("§10 Command.run overriding", () => {
  it("run can be overridden with super.run() while intercepting calls", () => {
    const cmd = new AuditedFeedCommand();

    cmd.run(new Dog("Rex", "Lab"), { time: "morning" });
    cmd.run(new Cat("Mimi", true), { time: "evening" });

    deepEqual(cmd.auditLog, ["resolveDog:Rex@morning", "resolveCat:Mimi@evening"]);
  });
});

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

describe("§12 edge cases", () => {
  it("single-subject command", () => {
    const cmd = new DogOnlyCommand();
    const result = cmd.run(new Dog("Rex", "Lab"), "hello");
    strictEqual(result, 8); // "Rex" (3) + "hello" (5)
  });

  it("primitive (number) as object type", () => {
    const cmd = new PrimObjCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), 5), "Rex:5");
    strictEqual(cmd.run(new Cat("Mimi", true), 5), "Mimi:10");
  });

  it("void return type — side effect only", () => {
    const cmd = new VoidCommand();
    cmd.run(new Dog("Rex", "Lab"), "action");
    strictEqual(cmd.sideEffect, "Rex:action");
  });

  it("shared strategy instance across subjects", () => {
    const cmd = new SharedStrategyCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "resolveDog:Rex:x");
    strictEqual(cmd.run(new Cat("Mimi", true), "y"), "resolveCat:Mimi:y");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §13 · MULTIPLE COMMANDS ON SAME SUBJECT SET
// ═══════════════════════════════════════════════════════════════════

describe("§13 multiple commands on same subject set", () => {
  it("same subject dispatched correctly through different commands", () => {
    const feed = new FeedCommand();
    const groom = new GroomCommand();
    const clinic: Clinic = { name: "Vet", hasEmergency: false };

    const dog = new Dog("Rex", "Poodle");

    const feedResult = feed.run(dog, { time: "morning" });
    const groomResult = groom.run(dog, clinic);

    strictEqual(feedResult.food, "small kibble");
    strictEqual(groomResult.service, "full clip");
  });
});

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

describe("§15 nested command hooks — end-to-end runtime", () => {
  it("export template invokes feed command via hook", () => {
    const feedCmd = new FeedCommand();
    const exportCmd = new ExportCommand(feedCmd);

    const r1 = exportCmd.run(new Dog("Rex", "Labrador"), { format: "CSV" });
    const r2 = exportCmd.run(new Cat("Mimi", true), { format: "JSON" });

    strictEqual(r1, "[CSV] resolveDog:Rex → large kibble");
    strictEqual(r2, "[JSON] resolveCat:Mimi → indoor formula");
  });

  it("underlying strategy selection preserved through hooks", () => {
    const feedCmd = new FeedCommand();
    const exportCmd = new ExportCommand(feedCmd);

    const lab = exportCmd.run(new Dog("Buddy", "Labrador"), { format: "XML" });
    const chi = exportCmd.run(new Dog("Tiny", "Chihuahua"), { format: "XML" });

    strictEqual(lab, "[XML] resolveDog:Buddy → large kibble");
    strictEqual(chi, "[XML] resolveDog:Tiny → small kibble");
  });

  it("three-level hook chain: audit → export → feed", () => {
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
  });
});

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
//   ImageOnlyCommand only visits ImageNode (declares resolveImageNode).
//   When used as a hook for Template<..., [ImageOnlyCommand], TextNode>,
//   CommandHooks checks that ImageOnlyCommand has resolveTextNode — it
//   does not, so the hook property resolves to `never`.
//   The @ts-expect-error below proves the error surfaces at the satisfies site.
//   The invocation-site proof (_16f) shows it's also caught there.

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
        // @ts-expect-error — ImageOnlyCommand lacks resolveTextNode, so CommandHooks
        // resolves to { imageOnly: "Error: hook Command does not declare visit methods for all subjects in SU" }
        imageOnly: this.imgCmd,
        execute: (subject: TextNode, object: AppContext): string => {
          return subject.text;
        },
      } satisfies Template<TextCommandWithImageHook, [ImageOnlyCommand], TextNode>;
    }
  }

  // The command itself runs fine because execute doesn't invoke the bad hook
  const cmd = new TextCommandWithImageHook(new ImageOnlyCommand());
  const imgCmd = new ImageOnlyCommand();

  // Also caught at the invocation site:
  const _16f = () => {
    // @ts-expect-error — TextNode is not assignable to ImageNode
    imgCmd.run(new TextNode("oops"), { theme: "x" });
  };
}

describe("§16 document domain — second independent domain validation", () => {
  it("double-dispatch routes TextNode and ImageNode to correct templates", () => {
    const ctx: AppContext = { theme: "dark-mode" };
    const renderCmd = new RenderCommand();

    const textResult = renderCmd.run(new TextNode("Hello World"), ctx);
    const imageResult = renderCmd.run(new ImageNode("hero.png"), ctx);

    strictEqual(textResult, '<span class="dark-mode">Hello World</span>');
    strictEqual(imageResult, '<img src="hero.png" class="dark-mode" />');
  });

  it("nested hook: DocExportCommand → RenderCommand via template DI", () => {
    const ctx: AppContext = { theme: "dark-mode" };
    const renderCmd = new RenderCommand();
    const exportCmd = new DocExportCommand(renderCmd);

    const result = exportCmd.run(new TextNode("Nested Context"), ctx);
    strictEqual(result, '[EXPORTED] <span class="dark-mode">Nested Context</span>');
  });

  it("16c: missing resolveImageNode rejected at call site", () => void 0);
  it("16d: ImageNode rejected by TextNode-only DocExportCommand", () => void 0);
  it("16e: template missing hook `render` property rejected at implements", () => void 0);
  it("16f: hook invoked on wrong subject rejected at call site", () => void 0);
});

// ═══════════════════════════════════════════════════════════════════
// §17 · MULTI-HOOK TEMPLATE — H tuple with two hooks
//
//   §8 and §15 each exercise H = [OneHook]. This section proves that
//   H = [HookA, HookB] works correctly: both hooks are structurally
//   required by CommandHooks<[LogCommand, GroomCommand]>, both are
//   injected, and both are invoked inside execute() with their return
//   values composed into the final result — making the assertions
//   directly sensitive to both hook calls.
// ═══════════════════════════════════════════════════════════════════

class RichFeedCommand extends Command<Person, { time: string }, FeedResult, [Dog]> {
  readonly commandName = "richFeed" as const;
  private log: LogCommand;
  private groom: GroomCommand;
  constructor(log: LogCommand, groom: GroomCommand) {
    super();
    this.log = log;
    this.groom = groom;
  }
  resolveDog() {
    const log = this.log;
    const groom = this.groom;
    return {
      log,
      groom,
      execute(subject: Dog, object: { time: string }): FeedResult {
        const logEntry = log.run(subject, { action: object.time });
        const groomResult = groom.run(subject, { name: "Vet", hasEmergency: false });
        return {
          fed: true,
          // food depends on BOTH hooks: groomResult.groomed selects the branch,
          // logEntry.action provides the value — if either hook is not invoked,
          // this assertion fails.
          food: groomResult.groomed ? logEntry.action : "standard",
          amount: 2,
        };
      },
    } satisfies Template<RichFeedCommand, [LogCommand, GroomCommand], Dog>;
  }
}

describe("§17 multi-hook template — H = [LogCommand, GroomCommand]", () => {
  it("both hooks are invoked and their results composed into the return value", () => {
    const cmd = new RichFeedCommand(new LogCommand(), new GroomCommand());

    const result = cmd.run(new Dog("Rex", "Lab"), { time: "morning" });

    // food === "morning" proves both hooks were called:
    //   groomResult.groomed is true for any Dog (GroomCommand.resolveDog always sets groomed:true)
    //   logEntry.action === "morning" (LogCommand echoes the action field)
    strictEqual(result.food, "morning");
    strictEqual(result.fed, true);
    strictEqual(result.amount, 2);
  });

  it("hooks are independent — changing either changes the result", () => {
    const cmd = new RichFeedCommand(new LogCommand(), new GroomCommand());

    const morning = cmd.run(new Dog("Rex", "Lab"), { time: "morning" });
    const evening = cmd.run(new Dog("Rex", "Lab"), { time: "evening" });

    // logEntry.action reflects the object.time passed to run() — proves log hook
    // is re-invoked on every call, not cached
    strictEqual(morning.food, "morning");
    strictEqual(evening.food, "evening");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §18 · STRATEGY STATEFULNESS — cached vs. fresh instance lifetime
//
//   The visit method controls strategy lifetime. When it returns a new
//   object on every call (the default pattern), state on that object is
//   discarded after each run(). When it returns the same cached instance,
//   state accumulates. The framework is neutral — both are valid — but
//   the distinction is non-obvious and worth making explicit.
// ═══════════════════════════════════════════════════════════════════

class CountingStrategy {
  callCount = 0;
  execute(subject: Dog, object: string): string {
    return `${subject.name}:${++this.callCount}`;
  }
}

// Cached: resolveDog returns the same CountingStrategy instance every time
class CachingCommand extends Command<Person, string, string, [Dog]> {
  readonly commandName = "caching" as const;
  private readonly strategy = new CountingStrategy();
  resolveDog() {
    return this.strategy;
  }
}

// Fresh: resolveDog creates a new CountingStrategy on every dispatch
class FreshCommand extends Command<Person, string, string, [Dog]> {
  readonly commandName = "fresh" as const;
  resolveDog() {
    return new CountingStrategy();
  }
}

describe("§18 strategy statefulness — cached vs. fresh instance lifetime", () => {
  it("cached strategy instance accumulates state across run() calls", () => {
    const cmd = new CachingCommand();

    strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "Rex:1");
    strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "Rex:2");
    strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "Rex:3");
  });

  it("fresh strategy instance resets state on every run() call", () => {
    const cmd = new FreshCommand();

    strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "Rex:1");
    strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "Rex:1");
    strictEqual(cmd.run(new Dog("Rex", "Lab"), "x"), "Rex:1");
  });
});
