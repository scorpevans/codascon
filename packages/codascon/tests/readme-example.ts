import {
  Subject,
  Command,
  MiddlewareCommand,
  type Template,
  type MiddlewareTemplate,
  type CommandSubjectUnion,
  type Runnable,
} from "../src/index.js";

// ── Domain types ──────────────────────────────────────────────────────────────

interface Person {
  name: string;
}

interface Equipment {
  name: string;
  days?: number;
}

interface CheckoutResult {
  approved: boolean;
  daysGranted: number;
  note?: string;
}

// ── Subjects ──────────────────────────────────────────────────────────────────

class Student extends Subject implements Person {
  readonly resolverName = "resolveStudent" as const;
  readonly name: string;
  readonly year: number;
  constructor(name: string, year: number) {
    super();
    this.name = name;
    this.year = year;
  }
}

class Professor extends Subject implements Person {
  readonly resolverName = "resolveProfessor" as const;
  readonly name: string;
  readonly department: string;
  constructor(name: string, department: string) {
    super();
    this.name = name;
    this.department = department;
  }
}

// ── LogCommand ────────────────────────────────────────────────────────────────
// Non-parameterized template: execute uses the full CommandSubjectUnion — no SU generic.
// LogEntry is a concrete empty strategy. Both resolvers share one singleton instance.

abstract class LogTemplate implements Template<LogCommand> {
  execute(subject: CommandSubjectUnion<LogCommand>, entry: { message: string }): void {
    console.log(`[${subject.name}] ${entry.message}`);
  }
}

class LogEntry extends LogTemplate {}

class LogCommand extends Command<Person, { message: string }, void, [Student, Professor]> {
  readonly commandName = "log" as const;
  private readonly entry = new LogEntry();
  readonly defaultResolver = this.entry; // fallback declared for resolver methods
  resolveStudent(_s: Student) {
    return this.entry;
  }
}

// ── CheckoutTemplate — parameterized ──────────────────────────────────────────
// SU narrows each Strategy to its specific Subject, giving typed access to
// subject-specific fields (year, department).
// Declares LogCommand as a hook — shared across all Strategies.
// The cast to Equipment & { days: number } centralises the guarantee that
// middleware always fills days before the strategy runs.

abstract class CheckoutTemplate<
  SU extends CommandSubjectUnion<CheckoutCommand>,
> implements Template<CheckoutCommand, [LogCommand], SU> {
  readonly log = new LogCommand();

  execute(subject: SU, equipment: Equipment): CheckoutResult {
    // pattern to make visible that execute expects enrichment from middleware
    const enrichedEquipment: Equipment & { days: number } = equipment as Equipment & {
      days: number;
    };
    this.log.run(subject, {
      message: `checking out "${equipment.name}" for ${equipment.days} days`,
    });
    return this.approve(subject, enrichedEquipment);
  }

  protected abstract approve(subject: SU, equipment: Equipment & { days: number }): CheckoutResult;
}

class StudentCheckout extends CheckoutTemplate<Student> {
  protected approve(student: Student, equipment: Equipment & { days: number }): CheckoutResult {
    return { approved: true, daysGranted: equipment.days, note: `year ${student.year}` };
  }
}

class ProfessorCheckout extends CheckoutTemplate<Professor> {
  protected approve(professor: Professor, equipment: Equipment & { days: number }): CheckoutResult {
    return { approved: true, daysGranted: equipment.days, note: professor.department };
  }
}

// ── CheckoutMiddleware ────────────────────────────────────────────────────────
// Clamps days per subject before calling inner.run(), then logs execution time.
//   Student:   default 7 days, max 14
//   Professor: default 14 days, max 30

abstract class CheckoutMiddlewareTemplate<
  SU extends CommandSubjectUnion<CheckoutMiddleware>,
> implements MiddlewareTemplate<CheckoutMiddleware, [LogCommand], SU> {
  readonly log = new LogCommand();

  execute<T extends SU>(
    subject: T,
    eq: Equipment,
    inner: Runnable<T, Equipment, CheckoutResult>,
  ): CheckoutResult {
    const start = Date.now();
    // enrichment, validation and defaulting of argument
    const result = inner.run(subject, { ...eq, days: this.clamp(eq.days) });
    this.log.run(subject, { message: `checkout completed in ${Date.now() - start}ms` });
    return result;
  }

  protected abstract clamp(days: number | undefined): number;
}

class DefaultPolicy extends CheckoutMiddlewareTemplate<Student | Professor> {
  protected clamp(days: number | undefined): number {
    return Math.min(days ?? 7, 14);
  }
}

class ProfessorPolicy extends CheckoutMiddlewareTemplate<Professor> {
  protected clamp(days: number | undefined): number {
    return Math.min(days ?? 14, 30);
  }
}

class CheckoutMiddleware extends MiddlewareCommand<
  Person,
  Equipment,
  CheckoutResult,
  [Student, Professor]
> {
  readonly commandName = "checkoutPolicy" as const;
  private readonly forProfessor = new ProfessorPolicy();
  readonly defaultResolver = new DefaultPolicy();
  resolveProfessor(
    _p: Professor,
    _e: Equipment,
  ): MiddlewareTemplate<CheckoutMiddleware, [LogCommand], Professor> {
    return this.forProfessor;
  }
}

// ── CheckoutCommand ───────────────────────────────────────────────────────────

class CheckoutCommand extends Command<Person, Equipment, CheckoutResult, [Student, Professor]> {
  readonly commandName = "checkout" as const;

  override get middleware() {
    return [new CheckoutMiddleware()];
  }

  resolveStudent(_s: Student, _e: Equipment) {
    return new StudentCheckout();
  }
  resolveProfessor(_p: Professor, _e: Equipment) {
    return new ProfessorCheckout();
  }
}

// ── QS Run: LogCommand ────────────────────────────────────────────────────────

const log = new LogCommand();
log.run(new Student("Alice", 3), { message: "library card issued" });
log.run(new Professor("Prof. Smith", "Physics"), { message: "lab access granted" });

// ── Advanced Run: CheckoutCommand ─────────────────────────────────────────────

const checkout = new CheckoutCommand();

// Student days=45 → clamped to 14
console.log(checkout.run(new Student("Alice", 3), { name: "Oscilloscope", days: 45 }));

// Professor no days → defaults to 14
console.log(checkout.run(new Professor("Prof. Smith", "Physics"), { name: "Spectrometer" }));

// Student no days → defaults to 7
console.log(checkout.run(new Student("Bob", 1), { name: "Microscope" }));
