import { describe, it } from "vitest";
import { Command, Subject, type Template } from "./index.js";

function strictEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) throw new Error(msg ?? `Expected ${expected}, got ${actual}`);
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

class Bird extends Subject implements Person {
  readonly resolverName = "resolveBird" as const;
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
// §8b · TEMPLATE WITH DEFAULTRESOLVER HOOK
//
//   §8 exercises a hook Command with full explicit resolver coverage.
//   This section proves that a hook Command with `defaultResolver` (and
//   only partial explicit resolver coverage) works correctly at runtime:
//   subjects with an explicit resolver use it; subjects without one fall
//   through to defaultResolver. The food value encodes the dispatch path
//   ("explicit:" vs "default:") making assertions sensitive to which path ran.
// ═══════════════════════════════════════════════════════════════════

// Hook Command: only resolveDog is explicit; resolveCat and resolveBird fall to defaultResolver
class SparseLogCommand extends Command<Person, { action: string }, LogEntry, [Dog, Cat, Bird]> {
  readonly commandName = "sparseLog" as const;
  private readonly fallbackEntry = {
    execute: (s: Dog | Cat | Bird, o: { action: string }): LogEntry => ({
      action: `default:${o.action}`,
      subject: s.name,
    }),
  };
  readonly defaultResolver = this.fallbackEntry;
  resolveDog() {
    return {
      execute: (s: Dog, o: { action: string }): LogEntry => ({
        action: `explicit:${o.action}`,
        subject: s.name,
      }),
    };
  }
  // resolveCat and resolveBird intentionally absent — defaultResolver handles them
}

class SparseHookFeedStrategy implements Template<FeedCommand, [SparseLogCommand]> {
  sparseLog: SparseLogCommand;
  constructor(log: SparseLogCommand) {
    this.sparseLog = log;
  }
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    const entry = this.sparseLog.run(subject, { action: "feed" });
    return {
      fed: true,
      food: `${entry.action}:${entry.subject}`,
      amount: 1,
    };
  }
}

class SparseHookFeedCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "sparseHookFeed" as const;
  private logCmd: SparseLogCommand;
  constructor(logCmd: SparseLogCommand) {
    super();
    this.logCmd = logCmd;
  }
  resolveDog() {
    return new SparseHookFeedStrategy(this.logCmd);
  }
  resolveCat() {
    return new SparseHookFeedStrategy(this.logCmd);
  }
  resolveBird() {
    return new SparseHookFeedStrategy(this.logCmd);
  }
}

describe("§8b template with defaultResolver hook", () => {
  it("explicit resolver method used for covered subject", () => {
    const cmd = new SparseHookFeedCommand(new SparseLogCommand());

    const result = cmd.run(new Dog("Rex", "Lab"), { time: "am" });

    strictEqual(result.food, "explicit:feed:Rex");
  });

  it("defaultResolver used for subjects without explicit resolver method", () => {
    const cmd = new SparseHookFeedCommand(new SparseLogCommand());

    const catResult = cmd.run(new Cat("Mimi", true), { time: "am" });
    const birdResult = cmd.run(new Bird("Tweety", true), { time: "am" });

    strictEqual(catResult.food, "default:feed:Mimi");
    strictEqual(birdResult.food, "default:feed:Tweety");
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
    return `[${object.format}] ${subject.resolverName}:${subject.name} → ${feedResult.food}`;
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
