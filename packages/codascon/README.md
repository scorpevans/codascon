# codascon

**A structural protocol for code organization with exhaustive compile-time type checking.**

**Codascon** distills high-level design patterns and SOLID principles into a zero-overhead TypeScript protocol. You describe what your domain looks like — which entities exist, which operations apply to them, and which strategies handle each combination — and your architectural intent is guarded with mathematical certainty. If a single edge case is unhandled, the compiler won't just warn you — it will stop you.

_The Runtime:_ 10 lines of code.

_The Power:_ Pure type-level enforcement via `Subject`, `Command`, `Template`, and `Strategy`.

---

## The Problem

Software development carries a cognitive burden that begins well before a line of business logic is written. Every new codebase demands structural decisions: which patterns to apply, how to organize responsibilities, where new code belongs as the system grows. SOLID principles and design patterns provide guidance, but they remain advisory — there is no formal protocol that enforces them, and no two codebases look alike.

The burden becomes acute as soon as a domain has multiple entity types and multiple operations. With _N_ entity types and _M_ operations, the naive approach scatters N×M branching logic across the codebase — `switch` statements, `instanceof` checks, and conditional chains. Add a new entity type and you must hunt down every branch that handles it. Miss one and you get a silent runtime bug, discovered in production.

The absence of a formal coding protocol compounds in several directions:

- **No consistent architecture.** Without a shared structural schema, every codebase is a dialect. Onboarding, auditing, and refactoring all require re-learning local conventions before any real work begins.
- **No compiler-checkable guarantees.** In dynamically typed languages, structurally incorrect code runs until it crashes. Even in statically typed languages, the type system can only enforce what the structure asks it to enforce — which, without a protocol, is rarely the right thing.
- **Brittle change management.** When business rules change, a developer must reason about the entire codebase to identify what needs updating. Without enforced isolation of concerns, every change carries hidden risk.

With the rise of AI-assisted development, these problems compound further. An LLM generating code without structural rails produces output that is internally inconsistent, architecturally divergent across iterations, and difficult to audit. The more code the AI writes, the more the absence of a formal protocol matters.

## The Solution — Codascon

Codascon is a structural protocol built around four primitives — `Subject`, `Command`, `Template`, `Strategy` — that formalizes double-dispatch into a verifiable, compiler-enforced structure. It does not replace business logic. It gives business logic a home.

**1. Compiler safety**

If your codascon code compiles, the dispatch mechanism will not fail at runtime. Every entity-operation combination is accounted for by construction, not by discipline. In languages with sufficient type facilities, this guarantee is enforced at compile time; the protocol still provides structural clarity in dynamically typed languages, with the runtime safety guarantee scaling to what the language's type system can enforce.

**2. Cognitive load — and code routing**

You implement strategies. The compiler tells you what is missing and where.

There is no N×M coverage matrix to keep in your head — the type system holds it. When a new `Subject` is added, every `Command` that must handle it shows a compile error at the exact call site. When a business rule changes for a specific entity-operation pair — say, extending how `Orders` are processed — you add a `Strategy` to the relevant `Command` and update its resolver logic. You do not have to consider the rest of the codebase.

**3. Code organization**

The protocol's separation of concerns — a `Command` with its visit methods, `Templates`, and `Strategies` forming a cohesive unit — naturally maps each operation to a single file. Codascon does not enforce this layout, but the structure makes it the obvious choice: each file is self-contained, adding an operation means adding a file, and the same domain consistently produces the same layout.

**4. Code architecture in YAML**

Codascon provides a consistent schema for expressing code architecture. Every domain built on it follows the same structural shape — `Subject`s, `Command`s, `Templates`, and `Strategies` — with no dialect variation across codebases or teams. Via [**Odetovibe**](https://www.npmjs.com/package/odetovibe), that architecture can be expressed in a declarative YAML schema and scaffolded directly into code, giving you a versioned, reviewable record of your domain structure, separate from implementation. Because the schema is structured and human-readable, non-coders can read it directly — or render it into flowcharts and diagrams — to visualize and reason about the system's architecture without touching the code.

**5. Vibe coding**

With a formal protocol in place, an LLM can generate structurally correct code by construction. The same business logic produces the same code — regardless of which model generated it or when. You focus on the business domain; the protocol ensures the output is consistent and auditable.

## Install

```bash
npm install codascon
# or
pnpm add codascon
```

## Quick Start

### Define Subjects

```typescript
import { Subject } from "codascon";

class Student extends Subject {
  readonly visitName = "resolveStudent" as const;
  clearance = "basic";
}

class Professor extends Subject {
  readonly visitName = "resolveProfessor" as const;
  clearance = "full";
}
```

### Define a Command

```typescript
import { Command } from "codascon";

interface Building {
  name: string;
  department: string;
}

interface AccessResult {
  granted: boolean;
  reason: string;
}

class AccessBuildingCommand extends Command<
  { clearance: string }, // base type — any type; all subjects must extend it
  Building, // object type — context
  AccessResult, // return type
  [Student, Professor] // subject union
> {
  readonly commandName = "accessBuilding" as const;

  resolveStudent(_student: Student, _building: Building) {
    return new DenyAccess(); // Strategy — defined below
  }

  resolveProfessor(_professor: Professor, _building: Building) {
    return new GrantAccess(); // Strategy — defined below
  }
}
```

### Define a Template and Strategies

```typescript
import { type Template, type CommandSubjectUnion } from "codascon";

// CommandSubjectUnion<C> extracts the subject union from a Command —
// no need to repeat Student | Professor manually
abstract class AccessTemplate implements Template<AccessBuildingCommand> {
  abstract execute(
    subject: CommandSubjectUnion<AccessBuildingCommand>,
    building: Building,
  ): AccessResult;
}

class GrantAccess extends AccessTemplate {
  execute(subject: CommandSubjectUnion<AccessBuildingCommand>, building: Building): AccessResult {
    return { granted: true, reason: `Access granted to ${building.name}` };
  }
}

class DenyAccess extends AccessTemplate {
  execute(subject: CommandSubjectUnion<AccessBuildingCommand>, building: Building): AccessResult {
    return { granted: false, reason: `Access denied to ${building.name}` };
  }
}
```

### Run

```typescript
const cmd = new AccessBuildingCommand();
const result = cmd.run(new Professor(), { name: "Science Hall", department: "CS" });
// { granted: true, reason: "Access granted to Science Hall" }
```

## Advanced Patterns

### Parameterized Templates

A `Template` can leave its subject union as a type parameter, letting `Strategy` classes narrow which `Subject`s they handle:

```typescript
abstract class CheckoutTemplate<SU extends CommandSubjectUnion<CheckoutCmd>> implements Template<
  CheckoutCmd,
  [AccessBuildingCommand],
  SU
> {
  constructor(readonly accessBuilding: AccessBuildingCommand) {}

  execute(subject: SU, equipment: Equipment): CheckoutResult {
    const access = this.accessBuilding.run(subject, equipmentBuilding);
    if (!access.granted) return deny(access.reason);
    return this.computeTerms(subject, equipment);
  }

  protected abstract computeTerms(subject: SU, eq: Equipment): CheckoutResult;
}

// Strategy narrows to Student only
class StudentCheckout extends CheckoutTemplate<Student> {
  protected computeTerms(student: Student, eq: Equipment): CheckoutResult {
    return { approved: true, days: 14 };
  }
}
```

### Command Hooks

`Template`s can declare dependencies on other `Command`s via the `H` parameter:

```typescript
abstract class AuditedTemplate implements Template<MyCommand, [AuditCommand, LogCommand]> {
  // Instantiated on the Template — shared across all Strategies
  readonly log = new LogCommand();
  // Abstract — each Strategy must provide its own instance
  abstract readonly audit: AuditCommand;
}

class MyStrategy extends AuditedTemplate {
  readonly audit = new AuditCommand(); // Strategy provides the abstract hook
}
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

Visit methods (strategy selection) remain synchronous. Only `execute` returns the `Promise`.

## How It Works

Codascon currently exposes four interfaces: Subject, Command, Template and Strategy.

A **`Subject`** is an entity (`Student`, `Professor`, `Visitor`). A **`Command`** is an operation (`AccessBuilding`, `CheckoutEquipment`). Each `Command` declares one visit method per `Subject` — the visit method inspects the `Subject` and the context, then returns a **`Template`** to execute. A **`Strategy`** is a concrete `Template` subclass that narrows the subject union and provides the implementation. The `Template` may declare **hooks** — references to other `Command`s it invokes during execution.

```
command.run(subject, object)
  → subject.getCommandStrategy(command, object)     // double dispatch
    → command[subject.visitName](subject, object)   // visit method selects strategy
      → returns a Template                          // the chosen strategy
  → template.execute(subject, object)               // strategy executes
  → returns result
```

## Real-World Example

> **Odetovibe is self-hosted** — its own ETL pipeline is built entirely on the codascon protocol, described in YAML, and its TypeScript scaffolding is generated by odetovibe itself.

## For AI-Assisted Development

Codascon is particularly well-suited for LLM-assisted ("vibe") coding. Note however that the domain engineering (e.g. `users` vs `student`+`professor` vs ...) and business logic (definition of `average()`) can never be completely outsourced to an LLM or a 3rd party.

### 1. One-step Vibe coding

Provide a domain description and let the LLM generate the full codascon implementation in one shot:

```markdown
You are an expert TypeScript architect. Build a new domain using the **codascon** protocol — a strict, double-dispatch visitor framework.

### Step 1: Understand the Protocol

Read both resources in full before writing any code:

- README: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/codascon/README.md
- SOURCE: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/codascon/src/index.ts

### Step 2: Study the Reference Implementation

Mimic the file structure and patterns from these real-world files exactly:

- SUBJECTS: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract/domain-types.ts
- COMMAND: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract/commands/validate-entry.ts
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

### Step 4: Implement This Domain

[INSERT YOUR DOMAIN DESCRIPTION]

Output complete, compile-safe TypeScript with stub strategy implementations — or equivalently, a YAML config in the odetovibe schema format.
```

### 2. Step-wise Vibe coding

A more controlled workflow: iterate on your business logic as YAML before any code is generated.

#### Step 1 — Describe your domain, generate a YAML configuration

```markdown
You are an expert in the codascon protocol. Given the following business domain description, generate a YAML configuration in the odetovibe schema format.

Study the schema and examples before writing the YAML:

- SCHEMA: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/schema.ts
- YAML (extract): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/specs/extract.yaml
- YAML (transform): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/specs/transform.yaml

Domain description:
[INSERT YOUR DOMAIN DESCRIPTION]

Output only the YAML. Do not generate TypeScript.
```

Iterate on the YAML with the LLM until the domain structure reflects your intent, before generating any code.

#### Step 2 — Generate TypeScript scaffolding with stubs

```bash
npx odetovibe domain.yaml --out src/
```

#### Step 3 — Implement your strategies

```markdown
Here are the generated TypeScript files from the codascon scaffolding. Each strategy has a stub `execute` method marked `// @odetovibe-generated`.

Here are the YAML code configurations:
[LINK YOUR YAML CONFIG(S)]

Source code generated by odetovibe:
src/

Implement the business logic for each stub based on the following rules:

[INSERT YOUR BUSINESS RULES]

Do not modify any class declarations, constructor signatures, or method signatures — only fill in the method bodies and define any new Base Types as needed.
```

## License

MIT
