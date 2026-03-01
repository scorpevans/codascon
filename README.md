# codascon

[![CI](https://github.com/scorpevans/codascon/actions/workflows/ci.yml/badge.svg)](https://github.com/scorpevans/codascon/actions/workflows/ci.yml)
[![npm codascon](https://img.shields.io/npm/v/codascon?label=codascon)](https://www.npmjs.com/package/codascon)
[![npm odetovibe](https://img.shields.io/npm/v/odetovibe?label=odetovibe)](https://www.npmjs.com/package/odetovibe)
[![license](https://img.shields.io/npm/l/codascon)](./LICENSE)

**A structural protocol for code organization with exhaustive compile-time type checking.**

**Codascon** distills high-level design patterns and SOLID principles into a zero-overhead TypeScript protocol. You describe what your domain looks like — which entities exist, which operations apply to them, and which strategies handle each combination — and your architectural intent is guarded with mathematical certainty. If a single edge case is unhandled, the compiler won't just warn you — it will stop you.

By enforcing exhaustive compile-time type checking, Codascon eliminates runtime dispatch errors at the source. For larger domains, [**Odetovibe**](https://www.npmjs.com/package/odetovibe) pairs with it to surgically weave declarative YAML code blueprints directly into your TypeScript AST — keeping your business logic pure and your architecture predictable and unbreakable.

_The Runtime:_ 10 lines of code.

_The Power:_ Pure type-level enforcement via `Subject`, `Command`, `Template`, and `Strategy`.

---

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

A **`Subject`** is an entity (`Student`, `Professor`, `Visitor`). A **`Command`** is an operation (`AccessBuilding`, `CheckoutEquipment`). Each `Command` declares one visit method per `Subject` — the visit method inspects the `Subject` and the context, then returns a **`Template`** to execute. A **`Strategy`** is a concrete `Template` subclass that narrows the subject union and provides the implementation. The `Template` may declare **hooks** — references to other `Command`s it invokes during execution.

The `this` parameter constraint on `Command.run()` is an intersection of all required visit methods. If any is missing, `run` becomes uncallable at the call site — not a runtime error, a red squiggle in your editor.

## Packages

| Package                             | Description                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| [`codascon`](./packages/codascon)   | The framework — `Subject`, `Command`, `Template`, `Strategy`, and type utilities |
| [`odetovibe`](./packages/odetovibe) | CLI + library: YAML schema, validation, and TypeScript scaffolding codegen       |

## Quick Start

### Install

```bash
npm install codascon
# or
pnpm add codascon
```

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
    // Use hook — invoke another Command during execution
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

This does not break LSP — a `StudentCheckout` is only returned for dispatches that route `Student`s to it.

### Command Hooks

`Template`s can declare dependencies on other `Command`s via the `H` parameter:

```typescript
// Template declares it needs an AuditCommand and a LogCommand
class AuditedTemplate implements Template<MyCommand, [AuditCommand, LogCommand]> {
  readonly audit: AuditCommand; // structural requirement from CommandHooks<H>
  readonly log: LogCommand; // structural requirement from CommandHooks<H>
  // ...
}
```

Hooks can be concrete (shared), abstract (`Strategy` provides), overridden, or constructor-injected.

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

## Odetovibe — YAML Configuration & Code Generation

For larger domains, define the structure declaratively and let **Odetovibe** generate the TypeScript scaffolding:

```yaml
namespace: campus

domainTypes:
  Student:
    visitName: resolveStudent
  Professor:
    visitName: resolveProfessor
  Building: {}
  CampusPerson: {}
  AccessResult: {}

commands:
  AccessBuildingCommand:
    commandName: accessBuilding
    baseType: CampusPerson
    objectType: Building
    returnType: AccessResult
    subjectUnion: [Student, Professor]
    dispatch:
      Student: AccessTemplate.DepartmentMatch
      Professor: GrantAccess
    templates:
      AccessTemplate:
        isParameterized: true
        subjectSubset: [Student, Professor]
        strategies:
          DepartmentMatch:
            subjectSubset: [Student]
      GrantAccess:
        isParameterized: false
        strategies: {}
```

### Generate

```bash
# CLI
npx odetovibe campus.yaml --out src/
npx odetovibe campus.yaml --out src/ --overwrite    # unconditional overwrite
npx odetovibe campus.yaml --out src/ --no-overwrite # strict: write .ode.ts on conflict
npx odetovibe --help
```

```typescript
// Library — three phases: Extract → Transform → Load
import { Project } from "ts-morph";
import { parseYaml, validateYaml, emitAst, writeFiles } from "odetovibe";

// Extract: parse YAML and validate against schema rules
const configIndex = parseYaml("campus.yaml");
const { valid, validationResults } = validateYaml(configIndex);
if (!valid) {
  for (const validationResult of validationResults) {
    for (const error of validationResult.errors)
      console.error(`[${error.entryKey}] ${error.rule}: ${error.message}`);
  }
  process.exit(1);
}

// Transform: emit TypeScript AST into an in-memory ts-morph Project
const project = new Project({ useInMemoryFileSystem: true });
emitAst(configIndex, { configIndex, project });

// Load: write SourceFiles to disk (merge preserves existing method bodies)
const results = await writeFiles(project, { targetDir: "./src", mode: "merge" });
for (const fileResult of results) {
  if (fileResult.conflicted) console.warn("conflict →", fileResult.path);
  else console.log(fileResult.created ? "created" : "updated", fileResult.path);
}
```

**Odetovibe** reads the YAML blueprint, validates it against the schema rules, and emits TypeScript classes that conform to the **Codascon** protocol — with all the type constraints already in place. You fill in the business logic; the structure is guaranteed.

See [`packages/odetovibe/src/schema.ts`](./packages/odetovibe/src/schema.ts) for the full schema documentation and validation rules.

## Real-World Example

[**Odetovibe**](https://www.npmjs.com/package/odetovibe) — the YAML-to-TypeScript code generator that ships alongside this framework — is built entirely on the codascon protocol. The domain is described in YAML and its TypeScript scaffolding is generated by odetovibe itself.

## When to Use Codascon

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

```
You are an expert TypeScript architect. Build a new domain using the codascon protocol — a strict, double-dispatch visitor framework.

Step 1: Understand the Protocol

Read both resources in full before writing any code:
- README: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/codascon/README.md
- SOURCE: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/codascon/src/index.ts

Step 2: Study the Reference Implementation

Mimic the file structure and patterns from these real-world files exactly:
- SUBJECTS: https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract/domain-types.ts
- COMMAND:  https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract/commands/validate-entry.ts
- SCHEMA:   https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/schema.ts
- YAML (extract):   https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/extract.yaml
- YAML (transform): https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/transform.yaml
- YAML (load):      https://raw.githubusercontent.com/scorpevans/codascon/main/packages/odetovibe/src/load.yaml

Step 3: Apply These Structural Rules

All output must conform to this layout:

    src/
    └── [namespace]              ← the namespace defined in the domain
        ├── types.ts             ← all Subject classes and plain interfaces
        └── commands/
            ├── FirstCommand.ts  ← Command + its Templates and Strategies
            └── SecondCommand.ts ← Command + its Templates and Strategies

Step 4: Implement This Domain

[INSERT YOUR DOMAIN DESCRIPTION OR YAML SCHEMA HERE]

Output complete, compile-safe TypeScript.
```

- **Structural rails** — The protocol tells the LLM exactly where new code goes. "Add a `Contractor` subject to `AccessBuildingCommand`" has one unambiguous implementation path.
- **YAML as prompting surface** — Hand the **Odetovibe** config to the LLM instead of describing changes in prose. Higher fidelity, lower ambiguity.
- **Compiler as guardrail** — Forgotten visit methods are compile errors, not silent bugs. The LLM gets immediate feedback.
- **Predictable file structure** — Each `Command` + `Template`s + `Strategy` classes lives in one file. No architectural decisions for the LLM to get wrong across iterations.

## Project Structure

```
codascon/                        # monorepo root
├── packages/
│   ├── codascon/                # published as "codascon"
│   │   └── src/
│   │       └── index.ts         # Subject, Command, Template, Strategy + type machinery
│   └── odetovibe/               # published as "odetovibe"
│       └── src/
│           ├── cli.ts           # bin entry: odetovibe <schema.yaml> --out <dir>
│           ├── index.ts         # library entry
│           ├── schema.ts        # YamlConfig type definitions
│           ├── extract/         # parse YAML → validate → ConfigIndex
│           ├── transform/       # ConfigIndex → ts-morph AST
│           └── load/            # ts-morph AST → write files to disk
└── tsconfig.base.json           # shared compiler options
```

## Development

```bash
pnpm install      # install all dependencies
pnpm build        # compile both packages (respects project reference order)
pnpm test         # run all tests
pnpm lint         # ESLint across all packages
pnpm format       # Prettier
pnpm clean        # remove build artifacts
```

## License

MIT
