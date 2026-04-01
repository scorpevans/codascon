import { describe, it } from "vitest";
import { Command, Subject, type Template, type CommandSubjectUnion } from "../src/index.js";

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

// A second hook command — used for "abstract hook" and "mixed hook" test patterns.
// AuditCommand covers all three subjects, making it valid for non-param templates.
class AuditCommand extends Command<Person, { action: string }, LogEntry, [Dog, Cat, Bird]> {
  readonly commandName = "audit" as const;
  resolveDog(d: Dog) {
    return {
      execute: (s: Dog, o: { action: string }): LogEntry => ({
        action: `audit:${o.action}`,
        subject: s.name,
      }),
    };
  }
  resolveCat(c: Cat) {
    return {
      execute: (s: Cat, o: { action: string }): LogEntry => ({
        action: `audit:${o.action}`,
        subject: s.name,
      }),
    };
  }
  resolveBird(b: Bird) {
    return {
      execute: (s: Bird, o: { action: string }): LogEntry => ({
        action: `audit:${o.action}`,
        subject: s.name,
      }),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// §8 · TEMPLATE WITH COMMAND HOOKS
// Matrix: T2 — Non-param, single concrete hook, concrete execute
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
// Matrix: T21 — Any, hook Command itself has defaultResolver
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
// Matrix: T14 — Param, single concrete hook, concrete execute
//         T17 — Param, no hooks, abstract execute (Strategy pattern)
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
// Matrix: T4 — Non-param, multiple concrete hooks, concrete execute
//         T12 — Non-param, mixed hooks, abstract execute (via satisfies)
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
// §T3 · NON-PARAM TEMPLATE — SINGLE ABSTRACT HOOK, CONCRETE EXECUTE
// Matrix: T3 — Non-param, single abstract hook, concrete execute
// ═══════════════════════════════════════════════════════════════════

abstract class AbsHookConcreteExecTemplate implements Template<FeedCommand, [AuditCommand]> {
  abstract readonly audit: AuditCommand;
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    const entry = this.audit.run(subject, { action: "feed" });
    return { fed: true, food: `abs-hook:${entry.subject}`, amount: 1 };
  }
}

class AbsHookConcreteExecStrategy extends AbsHookConcreteExecTemplate {
  readonly audit = new AuditCommand();
}

class AbsHookConcreteExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "absHookConcreteExec" as const;
  resolveDog() {
    return new AbsHookConcreteExecStrategy();
  }
  resolveCat() {
    return new AbsHookConcreteExecStrategy();
  }
  resolveBird() {
    return new AbsHookConcreteExecStrategy();
  }
}

describe("§T3 non-param, single abstract hook, concrete execute", () => {
  it("Strategy provides abstract hook; concrete execute on abstract template calls it", () => {
    const cmd = new AbsHookConcreteExecCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), { time: "am" }).food, "abs-hook:Rex");
    strictEqual(cmd.run(new Cat("Mimi", true), { time: "am" }).food, "abs-hook:Mimi");
    strictEqual(cmd.run(new Bird("Tweety", true), { time: "am" }).food, "abs-hook:Tweety");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §T8 · NON-PARAM TEMPLATE — SINGLE CONCRETE HOOK, ABSTRACT EXECUTE
// Matrix: T8 — Non-param, single concrete hook, abstract execute
// ═══════════════════════════════════════════════════════════════════

abstract class ConcreteHookAbsExecTemplate implements Template<FeedCommand, [LogCommand]> {
  readonly log = new LogCommand();
  abstract execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult;
}

class ConcreteHookAbsExecStrategy extends ConcreteHookAbsExecTemplate {
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    const entry = this.log.run(subject, { action: "feed" });
    return { fed: true, food: `conc-hook-abs:${entry.subject}`, amount: 1 };
  }
}

class ConcreteHookAbsExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "concreteHookAbsExec" as const;
  resolveDog() {
    return new ConcreteHookAbsExecStrategy();
  }
  resolveCat() {
    return new ConcreteHookAbsExecStrategy();
  }
  resolveBird() {
    return new ConcreteHookAbsExecStrategy();
  }
}

describe("§T8 non-param, single concrete hook, abstract execute", () => {
  it("Strategy provides execute; concrete hook initialized on abstract template is accessible", () => {
    const cmd = new ConcreteHookAbsExecCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), { time: "am" }).food, "conc-hook-abs:Rex");
    strictEqual(cmd.run(new Cat("Mimi", true), { time: "am" }).food, "conc-hook-abs:Mimi");
    strictEqual(cmd.run(new Bird("Tweety", true), { time: "am" }).food, "conc-hook-abs:Tweety");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §T9 · NON-PARAM TEMPLATE — SINGLE ABSTRACT HOOK, ABSTRACT EXECUTE
// Matrix: T9 — Non-param, single abstract hook, abstract execute
// ═══════════════════════════════════════════════════════════════════

abstract class AbsHookAbsExecTemplate implements Template<FeedCommand, [AuditCommand]> {
  abstract readonly audit: AuditCommand;
  abstract execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult;
}

class AbsHookAbsExecStrategy extends AbsHookAbsExecTemplate {
  readonly audit = new AuditCommand();
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    const entry = this.audit.run(subject, { action: "feed" });
    return { fed: true, food: `abs-both:${entry.subject}`, amount: 1 };
  }
}

class AbsHookAbsExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "absHookAbsExec" as const;
  resolveDog() {
    return new AbsHookAbsExecStrategy();
  }
  resolveCat() {
    return new AbsHookAbsExecStrategy();
  }
  resolveBird() {
    return new AbsHookAbsExecStrategy();
  }
}

describe("§T9 non-param, single abstract hook, abstract execute", () => {
  it("Strategy provides both abstract hook and abstract execute", () => {
    const cmd = new AbsHookAbsExecCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), { time: "am" }).food, "abs-both:Rex");
    strictEqual(cmd.run(new Bird("Tweety", true), { time: "am" }).food, "abs-both:Tweety");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §T12 · NON-PARAM TEMPLATE — MIXED HOOKS, ABSTRACT EXECUTE
// Matrix: T12 — Non-param, mixed hooks (concrete + abstract), abstract execute
// ═══════════════════════════════════════════════════════════════════

abstract class MixedHookAbsExecTemplate implements Template<
  FeedCommand,
  [LogCommand, AuditCommand]
> {
  readonly log = new LogCommand();
  abstract readonly audit: AuditCommand;
  abstract execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult;
}

class MixedHookAbsExecStrategy extends MixedHookAbsExecTemplate {
  readonly audit = new AuditCommand();
  execute(subject: Dog | Cat | Bird, object: { time: string }): FeedResult {
    const logEntry = this.log.run(subject, { action: "log" });
    const auditEntry = this.audit.run(subject, { action: "audit" });
    return {
      fed: true,
      food: `mixed-abs:${logEntry.subject}:${auditEntry.subject}`,
      amount: 1,
    };
  }
}

class MixedHookAbsExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "mixedHookAbsExec" as const;
  resolveDog() {
    return new MixedHookAbsExecStrategy();
  }
  resolveCat() {
    return new MixedHookAbsExecStrategy();
  }
  resolveBird() {
    return new MixedHookAbsExecStrategy();
  }
}

describe("§T12 non-param, mixed hooks, abstract execute", () => {
  it("both concrete and abstract hooks invoked inside Strategy-provided execute", () => {
    const cmd = new MixedHookAbsExecCommand();
    const result = cmd.run(new Dog("Rex", "Lab"), { time: "am" });
    strictEqual(result.food, "mixed-abs:Rex:Rex");
    strictEqual(result.fed, true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// §T15 · PARAM TEMPLATE — SINGLE ABSTRACT HOOK, CONCRETE EXECUTE
// Matrix: T15 — Param, single abstract hook, concrete execute
// ═══════════════════════════════════════════════════════════════════

abstract class ParamAbsHookConcreteExecTemplate<
  SU extends CommandSubjectUnion<FeedCommand>,
> implements Template<FeedCommand, [AuditCommand], SU> {
  abstract readonly audit: AuditCommand;
  execute(subject: SU, object: { time: string }): FeedResult {
    const entry = this.audit.run(subject, { action: "feed" });
    return { fed: true, food: `param-abs-hook:${entry.subject}`, amount: 1 };
  }
}

class ParamAbsHookConcreteExecStrategy extends ParamAbsHookConcreteExecTemplate<Dog | Cat> {
  readonly audit = new AuditCommand();
}

class ParamAbsHookConcreteExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "paramAbsHookConcreteExec" as const;
  resolveDog() {
    return new ParamAbsHookConcreteExecStrategy();
  }
  resolveCat() {
    return new ParamAbsHookConcreteExecStrategy();
  }
  resolveBird() {
    return {
      execute: (s: Bird, o: { time: string }): FeedResult => ({
        fed: s.canFly,
        food: `bird:${s.name}`,
        amount: 0.5,
      }),
    };
  }
}

describe("§T15 param, single abstract hook, concrete execute", () => {
  it("parameterized Strategy provides abstract hook; concrete execute in abstract template calls it", () => {
    const cmd = new ParamAbsHookConcreteExecCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), { time: "am" }).food, "param-abs-hook:Rex");
    strictEqual(cmd.run(new Cat("Mimi", true), { time: "am" }).food, "param-abs-hook:Mimi");
    strictEqual(cmd.run(new Bird("Tweety", true), { time: "am" }).food, "bird:Tweety");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §T17 · PARAM TEMPLATE — NO HOOKS, ABSTRACT EXECUTE (STRATEGY PATTERN)
// Matrix: T17 — Param, no hooks, abstract execute
// ═══════════════════════════════════════════════════════════════════

abstract class ParamNoHookAbsExecTemplate<
  SU extends CommandSubjectUnion<FeedCommand>,
> implements Template<FeedCommand, [], SU> {
  abstract execute(subject: SU, object: { time: string }): FeedResult;
}

class ParamNoHookDogStrategy extends ParamNoHookAbsExecTemplate<Dog> {
  execute(subject: Dog, object: { time: string }): FeedResult {
    return { fed: true, food: `dog-strategy:${subject.breed}`, amount: 2 };
  }
}

class ParamNoHookCatStrategy extends ParamNoHookAbsExecTemplate<Cat> {
  execute(subject: Cat, object: { time: string }): FeedResult {
    return {
      fed: true,
      food: `cat-strategy:${subject.indoor ? "indoor" : "outdoor"}`,
      amount: 1,
    };
  }
}

class ParamNoHookAbsExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "paramNoHookAbsExec" as const;
  resolveDog() {
    return new ParamNoHookDogStrategy();
  }
  resolveCat() {
    return new ParamNoHookCatStrategy();
  }
  resolveBird() {
    return {
      execute: (s: Bird, o: { time: string }): FeedResult => ({
        fed: s.canFly,
        food: `bird-direct:${s.name}`,
        amount: 0.3,
      }),
    };
  }
}

describe("§T17 param, no hooks, abstract execute — Strategy pattern", () => {
  it("parameterized Strategies narrow SU and each provide their own execute", () => {
    const cmd = new ParamNoHookAbsExecCommand();
    strictEqual(cmd.run(new Dog("Rex", "Labrador"), { time: "am" }).food, "dog-strategy:Labrador");
    strictEqual(cmd.run(new Cat("Mimi", false), { time: "am" }).food, "cat-strategy:outdoor");
    strictEqual(cmd.run(new Bird("Tweety", true), { time: "am" }).food, "bird-direct:Tweety");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §T18 · PARAM TEMPLATE — SINGLE CONCRETE HOOK, ABSTRACT EXECUTE
// Matrix: T18 — Param, single concrete hook, abstract execute
// ═══════════════════════════════════════════════════════════════════

abstract class ParamConcreteHookAbsExecTemplate<
  SU extends CommandSubjectUnion<FeedCommand>,
> implements Template<FeedCommand, [LogCommand], SU> {
  readonly log = new LogCommand();
  abstract execute(subject: SU, object: { time: string }): FeedResult;
}

class ParamConcreteHookDogStrategy extends ParamConcreteHookAbsExecTemplate<Dog> {
  execute(subject: Dog, object: { time: string }): FeedResult {
    const entry = this.log.run(subject, { action: "feed" });
    return { fed: true, food: `param-conc-hook:${entry.subject}:dog`, amount: 2 };
  }
}

class ParamConcreteHookCatStrategy extends ParamConcreteHookAbsExecTemplate<Cat> {
  execute(subject: Cat, object: { time: string }): FeedResult {
    const entry = this.log.run(subject, { action: "feed" });
    return { fed: true, food: `param-conc-hook:${entry.subject}:cat`, amount: 1 };
  }
}

class ParamConcreteHookAbsExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "paramConcreteHookAbsExec" as const;
  resolveDog() {
    return new ParamConcreteHookDogStrategy();
  }
  resolveCat() {
    return new ParamConcreteHookCatStrategy();
  }
  resolveBird() {
    return {
      execute: (s: Bird, o: { time: string }): FeedResult => ({
        fed: false,
        food: "none",
        amount: 0,
      }),
    };
  }
}

describe("§T18 param, single concrete hook, abstract execute", () => {
  it("parameterized Strategies each provide execute; concrete hook from abstract template is accessible", () => {
    const cmd = new ParamConcreteHookAbsExecCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), { time: "am" }).food, "param-conc-hook:Rex:dog");
    strictEqual(cmd.run(new Cat("Mimi", true), { time: "am" }).food, "param-conc-hook:Mimi:cat");
  });
});

// ═══════════════════════════════════════════════════════════════════
// §T20 · PARAM TEMPLATE — MIXED HOOKS, ABSTRACT EXECUTE
// Matrix: T20 — Param, mixed hooks (concrete + abstract), abstract execute
// ═══════════════════════════════════════════════════════════════════

abstract class ParamMixedHookAbsExecTemplate<
  SU extends CommandSubjectUnion<FeedCommand>,
> implements Template<FeedCommand, [LogCommand, AuditCommand], SU> {
  readonly log = new LogCommand();
  abstract readonly audit: AuditCommand;
  abstract execute(subject: SU, object: { time: string }): FeedResult;
}

class ParamMixedHookDogCatStrategy extends ParamMixedHookAbsExecTemplate<Dog | Cat> {
  readonly audit = new AuditCommand();
  execute(subject: Dog | Cat, object: { time: string }): FeedResult {
    const logEntry = this.log.run(subject, { action: "log" });
    const auditEntry = this.audit.run(subject, { action: "audit" });
    return {
      fed: true,
      food: `param-mixed:${logEntry.subject}:${auditEntry.subject}`,
      amount: 1,
    };
  }
}

class ParamMixedHookAbsExecCommand extends Command<
  Person,
  { time: string },
  FeedResult,
  [Dog, Cat, Bird]
> {
  readonly commandName = "paramMixedHookAbsExec" as const;
  resolveDog() {
    return new ParamMixedHookDogCatStrategy();
  }
  resolveCat() {
    return new ParamMixedHookDogCatStrategy();
  }
  resolveBird() {
    return {
      execute: (s: Bird, o: { time: string }): FeedResult => ({
        fed: false,
        food: "none",
        amount: 0,
      }),
    };
  }
}

describe("§T20 param, mixed hooks, abstract execute", () => {
  it("parameterized Strategy provides abstract hook and execute; concrete hook from abstract template is accessible", () => {
    const cmd = new ParamMixedHookAbsExecCommand();
    strictEqual(cmd.run(new Dog("Rex", "Lab"), { time: "am" }).food, "param-mixed:Rex:Rex");
    strictEqual(cmd.run(new Cat("Mimi", true), { time: "am" }).food, "param-mixed:Mimi:Mimi");
  });
});
