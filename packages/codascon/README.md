# codascon

**A structural protocol for code organization with exhaustive compile-time type checking.**

**Codascon** distills high-level design patterns and SOLID principles into a zero-overhead TypeScript protocol. You describe what your domain looks like — which entities exist, which operations apply to them, and which strategies handle each combination — and your architectural intent is guarded with mathematical certainty. If a single edge case is unhandled, the compiler won't just warn you — it will stop you.

_The Runtime:_ 10 lines of code.

_The Power:_ Pure type-level enforcement via four primitives: `Subject`, `Command`, `Template`, and `Strategy`.

---

## The Problem

Every codebase demands structural decisions before a line of business logic is written: which patterns apply, how responsibilities divide, where new code belongs. SOLID principles and design patterns provide guidance, but they remain advisory — there is no formal protocol that enforces them, and no two codebases look alike.

With _N_ entity types and _M_ operations, the naive approach scatters N×M branching logic — `switch` statements, `instanceof` checks, conditional chains — across the codebase. Add a new entity type and you must hunt down every branch that handles it. Miss one and you get a silent runtime bug, discovered in production.

The absence of a formal coding protocol compounds in several directions:

- **No consistent architecture.** Without a shared structural schema, every codebase is a dialect. Onboarding, auditing, and refactoring all require re-learning local conventions before any real work begins.
- **No compiler-checkable guarantees.** In dynamically typed languages, structurally incorrect code runs until it crashes. Even in statically typed languages, the compiler cannot enforce any structural requirements without a typed protocol.
- **Brittle change management.** When business rules change, a developer must reason about the entire codebase to identify what needs updating. Without enforced isolation of concerns, every change carries hidden risk.

With the rise of AI-assisted development, these problems compound further. An LLM generating code without structural rails produces output that is internally inconsistent, architecturally divergent across iterations, and difficult to audit. The more code the AI writes, the more the absence of a formal protocol matters.

## What Codascon Provides

**1. Exhaustive compile-time coverage**

If your codascon code compiles, the dispatch mechanism will not fail at runtime. Every entity-operation combination is accounted for by construction, not by discipline. In languages with sufficient type facilities, this guarantee is enforced at compile time; the protocol still provides structural clarity in dynamically typed languages, with the runtime safety guarantee scaling to what the language's type system can enforce.

**2. Bounded scope of change**

There is no N×M coverage matrix to keep in your head — the type system holds it. When a new `Subject` is added, every `Command` that must handle it shows a compile error at the exact call site. When a business rule changes for a specific entity-operation pair — say, extending how `Orders` are processed — you add a `Strategy` to the relevant `Command` and update its resolver logic. You do not have to consider the rest of the codebase.

**3. Code architecture in YAML**

Codascon provides a consistent schema for expressing code architecture. Every domain built on it follows the same structural shape — `Subject`s, `Command`s, `Templates`, and `Strategies` — with no dialect variation across codebases or teams. Via [**Odetovibe**](https://www.npmjs.com/package/odetovibe), that architecture can be expressed in a declarative YAML schema and scaffolded directly into code, giving you a versioned, reviewable record of your domain structure, separate from implementation. Because the schema is structured and human-readable, non-coders can read it directly — or it could be rendered into flowcharts and diagrams — to visualize and reason about the system's architecture without touching the code.

**4. Structural rails for AI-generated code (Vibe coding)**

With a formal protocol in place, an LLM can generate structurally correct code by construction. The same business logic produces the same code — regardless of which model generated it or when. You focus on the business domain; the protocol ensures the output is consistent and auditable.

## Install

```bash
npm install codascon
# or
pnpm add codascon
```

## Quick Start

### Define Subjects

A **`Subject`** is an entity in your domain. Codascon enforces that each `Subject` declares a `resolverName` — the method name its `Command`s must implement to handle it.

```typescript
import { Subject } from "codascon";

interface Person {
  name: string;
}

class Student extends Subject implements Person {
  readonly resolverName = "resolveStudent" as const;
  constructor(
    public readonly name: string,
    public readonly year: number,
  ) {
    super();
  }
}

class Professor extends Subject implements Person {
  readonly resolverName = "resolveProfessor" as const;
  constructor(
    public readonly name: string,
    public readonly department: string,
  ) {
    super();
  }
}
```

### Define a Command

A **`Command`** is an operation. Codascon enforces at the call site that a `Command` implements a resolver method per `Subject` — the resolver method inspects the `Subject` and the context, then returns a `Template` to execute.

```typescript
import { Command } from "codascon";

class LogCommand extends Command<Person, { message: string }, void, [Student, Professor]> {
  readonly commandName = "log" as const;
  private readonly entry = new LogEntry(); // Strategy — defined below
  resolveStudent(_s: Student) {
    return this.entry;
  }
  resolveProfessor(_p: Professor) {
    return this.entry;
  }
}
```

### Define Templates and their Strategies

A **`Template`** abstract class defines the execution contract for a `Command`. It may handle the full `Subject` union or be narrowed to a subset. **`Strategy`** classes provide the concrete implementations.

```typescript
import { type Template, type CommandSubjectUnion } from "codascon";

// execute handles the full subject union (Student | Professor) — no subject narrowing needed here.
// LogEntry is a concrete empty Strategy; both resolvers share one singleton instance (entry).
abstract class LogTemplate implements Template<LogCommand> {
  execute(subject: CommandSubjectUnion<LogCommand>, entry: { message: string }): void {
    console.log(`[${subject.name}] ${entry.message}`);
  }
}

class LogEntry extends LogTemplate {}
```

### Run

```typescript
const log = new LogCommand();

log.run(new Student("Alice", 3), { message: "library card issued" });
// [Alice] library card issued

log.run(new Professor("Prof. Smith", "Physics"), { message: "lab access granted" });
// [Prof. Smith] lab access granted
```

```
command.run(subject, object)
  → subject.getCommandStrategy(command, object)       // double dispatch
    → command[subject.resolverName](subject, object)  // resolver selects a Template
      → returns a Template
  → template.execute(subject, object)                 // Template executes
  → returns result
```

## Advanced Patterns

### Parameterized Templates

A `Template` can carry its subject union as a type parameter — letting each `Strategy` narrow which `Subject`s it handles and access subject-specific fields directly:

```typescript
interface Equipment {
  name: string;
  days?: number;
}

interface CheckoutResult {
  approved: boolean;
  daysGranted: number;
  note?: string;
}

class CheckoutCommand extends Command<Person, Equipment, CheckoutResult, [Student, Professor]> {
  readonly commandName = "checkout" as const;
  resolveStudent(_s: Student, _e: Equipment) {
    return new StudentCheckout();
  }
  resolveProfessor(_p: Professor, _e: Equipment) {
    return new ProfessorCheckout();
  }
}

abstract class CheckoutTemplate<
  SU extends CommandSubjectUnion<CheckoutCommand>,
> implements Template<CheckoutCommand, [], SU> {
  execute(subject: SU, equipment: Equipment): CheckoutResult {
    return this.approve(subject, equipment as Equipment & { days: number }); // days filled at runtime
  }
  protected abstract approve(subject: SU, equipment: Equipment & { days: number }): CheckoutResult;
}

// SU = Student — typed access to student.year
class StudentCheckout extends CheckoutTemplate<Student> {
  protected approve(student: Student, equipment: Equipment & { days: number }): CheckoutResult {
    return { approved: true, daysGranted: equipment.days, note: `year ${student.year}` };
  }
}

// SU = Professor — typed access to professor.department
class ProfessorCheckout extends CheckoutTemplate<Professor> {
  protected approve(professor: Professor, equipment: Equipment & { days: number }): CheckoutResult {
    return { approved: true, daysGranted: equipment.days, note: professor.department };
  }
}
```

### Command Hooks

`Template`s declare dependencies on other `Command`s via the `H` parameter. Hook properties are named after the Command's `commandName` — the compiler enforces both presence and subject coverage at the `implements` site.

Building on the previous section, add `LogCommand` (from Quick Start) as a hook:

```typescript
abstract class CheckoutTemplate<
  SU extends CommandSubjectUnion<CheckoutCommand>,
> implements Template<CheckoutCommand, [LogCommand], SU> {
  // [LogCommand] added
  readonly log = new LogCommand(); // hook — shared across all Strategies

  execute(subject: SU, equipment: Equipment): CheckoutResult {
    this.log.run(subject, {
      message: `checking out "${equipment.name}" for ${equipment.days} days`,
    });
    return this.approve(subject, equipment as Equipment & { days: number });
  }

  protected abstract approve(subject: SU, equipment: Equipment & { days: number }): CheckoutResult;
}
```

- Hook properties can also be `abstract` — requiring each Strategy to provide its own instance
- Hooks can be injected via the resolver method when constructing the Strategy
- The compiler rejects a hook whose subject union does not cover the Template's `SU`

### Middleware

A `MiddlewareCommand` intercepts every dispatch through a `Command` — before resolver selection and after strategy execution. Resolver methods return `MiddlewareTemplate` instead of `Template`, with a third `inner` continuation argument in `execute`:

```typescript
import { MiddlewareCommand, type MiddlewareTemplate, type Runnable } from "codascon";

// Clamps days per subject and logs timing. Non-parameterized — clamp() doesn't need
// the subject type, so Student | Professor is used directly.
//   Student:   default 7 days, max 14
//   Professor: default 14 days, max 30
abstract class CheckoutMiddlewareTemplate implements MiddlewareTemplate<
  CheckoutMiddleware,
  [LogCommand],
  Student | Professor
> {
  readonly log = new LogCommand();

  execute(
    subject: Student | Professor,
    eq: Equipment,
    inner: Runnable<Student | Professor, Equipment, CheckoutResult>,
  ): CheckoutResult {
    const start = Date.now();
    const result = inner.run(subject, { ...eq, days: this.clamp(eq.days) });
    this.log.run(subject, { message: `checkout completed in ${Date.now() - start}ms` });
    return result;
  }

  protected abstract clamp(days: number | undefined): number;
}

class StudentPolicy extends CheckoutMiddlewareTemplate {
  protected clamp(days: number | undefined): number {
    return Math.min(days ?? 7, 14);
  }
}

class ProfessorPolicy extends CheckoutMiddlewareTemplate {
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
  private readonly forStudent = new StudentPolicy();
  private readonly forProfessor = new ProfessorPolicy();

  resolveStudent(
    _s: Student,
    _e: Equipment,
  ): MiddlewareTemplate<CheckoutMiddleware, [LogCommand], Student> {
    return this.forStudent;
  }
  resolveProfessor(
    _p: Professor,
    _e: Equipment,
  ): MiddlewareTemplate<CheckoutMiddleware, [LogCommand], Professor> {
    return this.forProfessor;
  }
}
```

Register middleware by overriding `get middleware()` on the Command — first element is outermost:

```typescript
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
```

- **Declare `inner` as `Runnable<SU, O, R>`**, not as the full Command type.
- **Omit `inner.run()`** to short-circuit — the downstream command and strategy do not execute.
- **Object enrichment**: pass `{ ...object, extra }` to `inner.run()` to add context downstream.
  Declare enrichment fields as optional on `O` so that Strategies that don't use them still typecheck.
- **`MiddlewareCommand.run()` is a compile error** in well-typed TypeScript — only register
  middleware via `Command.middleware`.
- **Domain-wide middleware**: override `get middleware()` in a shared base class; subclasses compose
  with `[...super.middleware, mw]`.

### Run

```typescript
const checkout = new CheckoutCommand();

checkout.run(new Student("Alice", 3), { name: "Oscilloscope", days: 45 });
// [Alice] checking out "Oscilloscope" for 14 days   (clamped from 45)
// [Alice] checkout completed in 0ms
// → { approved: true, daysGranted: 14, note: "year 3" }

checkout.run(new Professor("Prof. Smith", "Physics"), { name: "Spectrometer" });
// [Prof. Smith] checking out "Spectrometer" for 14 days   (Professor default)
// [Prof. Smith] checkout completed in 0ms
// → { approved: true, daysGranted: 14, note: "Physics" }

checkout.run(new Student("Bob", 1), { name: "Microscope" });
// [Bob] checking out "Microscope" for 7 days   (Student default)
// [Bob] checkout completed in 0ms
// → { approved: true, daysGranted: 7, note: "year 1" }
```

### Async Commands

Set the return type to `Promise<T>`:

```typescript
class AssignParkingCommand extends Command<
  Person,
  ParkingLot,
  Promise<ParkingAssignment>,
  [Student, Professor]
> {
  /* ... */
}

// Usage
const result = await parkingCmd.run(student, lotA);
```

Resolver methods (strategy selection) remain synchronous. Only `execute` returns the `Promise`.


### Default Resolver

A `Command` can declare `defaultResolver` as a catch-all — it fires for any subject that has no specific resolver method. Declaring it relaxes exhaustiveness: `run()` is callable without a resolver per subject.

```typescript
class AccessBuildingCommand extends Command<
  Principal,
  Building,
  AccessResult,
  [Student, Professor]
> {
  readonly commandName = "accessBuilding" as const;

  resolveProfessor(_professor: Professor, _building: Building) {
    return new FullAccess(); // specific resolver — takes precedence for Professor
  }

  defaultResolver(_subject: Student | Professor, _building: Building) {
    return new BasicAccess(); // catch-all — fires for Student (and any subject with no specific resolver)
  }
}
```

- `defaultResolver` receives the full subject union — it must handle every subject it may be called with.
- When a specific resolver method exists for a subject, it takes precedence.
- `defaultResolver` fulfills the exhaustiveness requirement for every subject that has no specific resolver — coverage is maintained, just via the catch-all instead of a per-subject method.


## Real-World Example

> **Odetovibe is self-hosted** — its own ETL pipeline is built entirely on the codascon protocol, described in YAML, and its TypeScript scaffolding is generated by odetovibe itself.

## AI-Assisted Development

Codascon is particularly well-suited for LLM-assisted ("vibe") coding. Note however that the domain engineering (e.g. `users` vs `student`+`professor` vs ...) and business logic (e.g. `tryAccess()` definition) can never be completely outsourced to an LLM or a 3rd party.

### 1. One-step Vibe coding

Provide a domain description and let the LLM generate the full codascon implementation in one shot:

```markdown
You are an expert TypeScript architect. Build a new domain using **codascon** — a structural protocol for code organization with exhaustive compile-time type checking.

### Step 1: Understand the Protocol

Read both resources in full before writing any code:

- README: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/codascon/README.md
- SOURCE: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/codascon/src/index.ts

### Step 2: Study the Reference Implementation

Mimic the file structure and patterns from these real-world files exactly:

- SUBJECT1: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract/domain-types.ts
- SUBJECT2: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/transform/domain-types.ts
- SUBJECT3: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/load/domain-types.ts
- COMMAND1: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract/commands/validate-entry.ts
- COMMAND2: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/transform/commands/emit-ast.ts
- COMMAND3: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/load/commands/write-file.ts
- SCHEMA: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/schema.ts
- YAML (extract): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/specs/extract.yaml
- YAML (transform): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/specs/transform.yaml
- YAML (load): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/specs/load.yaml

### Step 3: Apply These Structural Rules

All output must conform to this layout:

    src/
    └── [namespace]              ← the namespace defined in the domain
        ├── TypesA.ts            ← Subject classes and plain interfaces
        ├── TypesB.ts            ← Subject classes and plain interfaces
        └── commands/
            ├── FirstCommand.ts  ← Command + its Templates and Strategies
            └── SecondCommand.ts ← Command + its Templates and Strategies

Additional implementation rules:

- All Templates are abstract classes; `execute` is always concrete on the Template — Strategies override `protected abstract` methods or fields, not `execute` directly
- Apply the template method pattern in `execute`: extract variable behaviour into `protected abstract` methods or fields that Strategies implement
- Use commandHooks liberally: when `execute` invokes another domain operation, declare it as a hook Command on the Template — prefer splitting logic across multiple Commands over concentrating it in a single `execute` body
- Use singletons for Command, Template, and Strategy instances whenever custom constructor arguments are not required — instantiate once and reuse
- Use middleware for cross-cutting concerns such as logging, auditing, timing, and default enrichments — prefer a middleware Command over duplicating the same logic in individual Templates or Strategies

### Step 4: Implement This Domain

[INSERT YOUR DOMAIN DESCRIPTION]

Output complete, compile-safe TypeScript with stub strategy implementations.
```

### 2. Step-wise Vibe coding

A more controlled workflow: iterate on your business logic as YAML before any code is generated.

#### Step 1 — Describe your domain, generate a YAML configuration

Use the one-step prompt above, replacing the final instruction with:

> Output a YAML config in the odetovibe schema format.

Iterate on the YAML with the LLM until the domain structure reflects your intent, before generating any code.

#### Step 2 — Generate TypeScript scaffolding with stubs

```bash
npx odetovibe domain.yaml --outDir src/
```

#### Step 3 — Implement your strategies

```markdown
Here are the generated TypeScript files from the codascon scaffolding. Each template has a concrete `execute` stub marked `// @odetovibe-generated` — implement the business logic there. Strategies inherit from their template and can override `execute` if needed.

Here are the YAML code configurations:
[LINK YOUR YAML CONFIG(S)]

Source code generated by odetovibe:
src/

Implement the business logic for each stub based on the following rules:

[INSERT YOUR BUSINESS RULES]

Do not modify existing class declarations or method signatures — only fill in the method bodies and update or add Domain Types as needed.
```

> **Note:** You can return to steps 1 and 2 at any time to iterate on your YAML config. Rerun the odetovibe command and all updates will be merged into your existing files, preserving any business logic you have already implemented.

## License

MIT
