# codascon

**A structural protocol for code organization with exhaustive compile-time type checking.**

**Codascon** distills high-level design patterns and SOLID principles into a zero-overhead TypeScript protocol. You describe what your domain looks like — which entities exist, which operations apply to them, and which strategies handle each combination — and your architectural intent is guarded with mathematical certainty. If a single edge case is unhandled, the compiler won't just warn you — it will stop you.

_The Runtime:_ 10 lines of code.

_The Power:_ Pure type-level enforcement via `Subject`, `Command`, `Template`, and `Strategy`.

## The Problem

When you have _N_ entity types and _M_ operations, the naive approach produces N×M branching logic scattered across your codebase. Add a new entity type and you must hunt down every `switch` and `instanceof` check. Miss one and you get a silent runtime bug.

**Codascon** makes that impossible. If you add a `Subject` and forget to handle it in any `Command`, your code doesn't compile.

## How It Works

```
command.run(subject, object)
  → subject.getCommandStrategy(command, object)     // double dispatch
    → command[subject.visitName](subject, object)   // visit method selects strategy
      → returns a Template                          // the chosen strategy
  → template.execute(subject, object)               // strategy executes
  → returns result
```

A **`Subject`** is an entity (`Student`, `Professor`, `Visitor`). A **`Command`** is an operation (`AccessBuilding`, `CheckoutEquipment`). Each `Command` declares one visit method per `Subject` — the visit method inspects the `Subject` and the context, then returns a **`Template`** (strategy) to execute. The `Template` may declare **hooks** — references to other `Command`s it invokes during execution.

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
  constructor(
    public readonly name: string,
    public readonly department: string,
    public readonly year: 1 | 2 | 3 | 4,
  ) {
    super();
  }
}

class Professor extends Subject {
  readonly visitName = "resolveProfessor" as const;
  constructor(
    public readonly name: string,
    public readonly tenured: boolean,
  ) {
    super();
  }
}
```

### Define a Command with Templates

```typescript
import { Command } from "codascon";
import type { Template } from "codascon";

interface Building {
  name: string;
  department: string;
}

interface AccessResult {
  granted: boolean;
  reason: string;
}

class AccessBuildingCommand extends Command<
  { name: string }, // base type — shared interface
  Building, // object type — context
  AccessResult, // return type
  [Student, Professor] // subject union
> {
  readonly commandName = "accessBuilding" as const;

  resolveStudent(student: Student, building: Readonly<Building>) {
    if (student.department === building.department) return new GrantAccess();
    return new DenyAccess();
  }

  resolveProfessor(professor: Professor, building: Readonly<Building>) {
    if (professor.tenured) return new GrantAccess();
    return new DenyAccess();
  }
}
```

### Define Templates (Strategies)

```typescript
class GrantAccess implements Template<AccessBuildingCommand> {
  execute(subject: Student | Professor, building: Building): AccessResult {
    return { granted: true, reason: `${subject.name} has access` };
  }
}

class DenyAccess implements Template<AccessBuildingCommand> {
  execute(subject: Student | Professor, building: Building): AccessResult {
    return { granted: false, reason: `${subject.name} denied` };
  }
}
```

### Run

```typescript
const cmd = new AccessBuildingCommand();
const result = cmd.run(new Student("Alice", "CS", 3), { name: "Science Hall", department: "CS" });
// { granted: true, reason: "Alice has access" }
```

## What the Compiler Catches

**Missing visit method** — Remove `resolveProfessor` from the `Command` above. The call `cmd.run(...)` immediately shows a type error. Not at the class declaration, at the call site — you see the error exactly where it matters.

**Wrong `Subject` type** — Pass a `Visitor` to a `Command` that only handles `[Student, Professor]`. Compile error.

**Missing hook property** — Declare `implements Template<Cmd, [AuditCommand]>` without an `audit` property. Compile error.

**Wrong return type** — Return a `string` from `execute` when the `Command` expects `AccessResult`. Compile error.

**Duplicate `visitName`** — Two `Subject`s with the same `visitName` in one `Command`'s union. The type system creates an impossible intersection, making the visit method unimplementable.

**Missing abstract method in a `Strategy`** — A `Strategy` that extends an abstract `Template` without implementing all abstract methods. Compile error at the class declaration.

## Advanced Patterns

### Parameterized Templates

A `Template` can leave its subject union as a type parameter, letting `Strategy` classes narrow which `Subject`s they handle:

```typescript
abstract class CheckoutTemplate<CSU extends Student | Professor> implements Template<
  CheckoutCmd,
  [AccessBuildingCommand],
  CSU
> {
  readonly accessBuilding: AccessBuildingCommand;
  constructor(cmd: AccessBuildingCommand) {
    this.accessBuilding = cmd;
  }

  execute(subject: CSU, equipment: Equipment): CheckoutResult {
    const access = this.accessBuilding.run(subject, equipmentBuilding);
    if (!access.granted) return deny(access.reason);
    return this.computeTerms(subject, equipment);
  }

  protected abstract computeTerms(subject: CSU, eq: Equipment): CheckoutResult;
}

// Strategy narrows to Student only
class StudentCheckout extends CheckoutTemplate<Student> {
  protected computeTerms(student: Student, eq: Equipment): CheckoutResult {
    return { approved: true, days: student.year >= 3 ? 14 : 7 };
  }
}
```

### Command Hooks

`Template`s can declare dependencies on other `Command`s via the `H` parameter:

```typescript
class AuditedTemplate implements Template<MyCommand, [AuditCommand, LogCommand]> {
  readonly audit: AuditCommand; // structural requirement from CommandHooks<H>
  readonly log: LogCommand; // structural requirement from CommandHooks<H>
  // ...
}
```

Hooks can be concrete (shared), abstract (`Strategy` provides), overridden, or constructor-injected.

### Async Commands

```typescript
class AssignParkingCommand extends Command<
  Person,
  ParkingLot,
  Promise<ParkingAssignment>,
  [Student, Professor]
> {
  /* ... */
}

const result = await parkingCmd.run(student, lotA);
```

Visit methods (strategy selection) remain synchronous. Only `execute` returns the `Promise`.

## Real-World Example

[**Odetovibe**](https://www.npmjs.com/package/odetovibe) — the YAML-to-TypeScript code generator that ships alongside this framework — is built entirely on the codascon protocol. The domain is described in YAML and its TypeScript scaffolding is generated by odetovibe itself.

## When to Use

**Good fit:**

- Domain with multiple entity types and multiple operations that grow along both axes
- Permission / access control systems
- Document processing pipelines
- Game entity interactions
- Workflow engines where behavior varies by entity type and operation context

**Not a good fit:**

- Simple CRUD services
- Linear data pipelines
- Applications where a `switch` or polymorphic method suffices
- Domains with one or two entity types that rarely change

The abstraction tax is real. It pays off when extension happens along the axes the protocol anticipates.

## For AI-Assisted Development

**Codascon** is particularly well-suited for LLM-assisted ("vibe") coding:

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
- YAML (extract): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract.yaml
- YAML (transform): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/transform.yaml
- YAML (load): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/load.yaml

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

- **Structural rails** — The protocol tells the LLM exactly where new code goes. "Add a `Contractor` subject to `AccessBuildingCommand`" has one unambiguous implementation path.
- **YAML as prompting surface** — Hand the [**Odetovibe**](https://www.npmjs.com/package/odetovibe) config to the LLM instead of describing changes in prose. Higher fidelity, lower ambiguity.
- **Compiler as guardrail** — Forgotten visit methods are compile errors, not silent bugs. The LLM gets immediate feedback.
- **Predictable file structure** — Each `Command` + `Template`s + `Strategy` classes lives in one file. No architectural decisions for the LLM to get wrong across iterations.

## License

MIT
