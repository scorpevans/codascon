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

Software development carries a cognitive burden that begins well before a line of business logic is written. Every new codebase demands structural decisions: which patterns to apply, how to organize responsibilities, where new code belongs as the system grows. SOLID principles and design patterns provide guidance, but they remain advisory — there is no formal protocol that enforces them, and no two codebases look alike.

The burden becomes acute as soon as a domain has multiple entity types and multiple operations. With _N_ entity types and _M_ operations, the naive approach scatters N×M branching logic across the codebase — `switch` statements, `instanceof` checks, and conditional chains. Add a new entity type and you must hunt down every branch that handles it. Miss one and you get a silent runtime bug, discovered in production.

The absence of a formal coding protocol compounds in several directions:

- **No consistent architecture.** Without a shared structural schema, every codebase is a dialect. Onboarding, auditing, and refactoring all require re-learning local conventions before any real work begins.
- **No compiler-checkable guarantees.** In dynamically typed languages, structurally incorrect code runs until it crashes. Even in statically typed languages, the type system can only enforce what the structure asks it to enforce — which, without a protocol, is rarely the right things.
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

**4. Vibe coding**

With a formal protocol in place, an LLM can generate structurally correct code by construction. The same business logic produces the same file layout, the same type constraints, the same dispatch pattern — regardless of which model generated it or when. You focus on the business domain; the protocol ensures the output is consistent, auditable, and extensible.

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

### Define a Command

```typescript
import { Command, type Template, type CommandSubjectUnion } from "codascon";

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

### Define a Template and Strategies

```typescript
// CommandSubjectUnion<C> extracts the subject union from a Command —
// no need to repeat Student | Professor manually
abstract class AccessTemplate implements Template<AccessBuildingCommand> {
  abstract execute(
    subject: CommandSubjectUnion<AccessBuildingCommand>,
    building: Building,
  ): AccessResult;
}

class GrantAccess extends AccessTemplate {
  execute(subject: CommandSubjectUnion<AccessBuildingCommand>): AccessResult {
    return { granted: true, reason: `${subject.name} has access` };
  }
}

class DenyAccess extends AccessTemplate {
  execute(subject: CommandSubjectUnion<AccessBuildingCommand>): AccessResult {
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

## Advanced Patterns

### Parameterized Templates

A `Template` can leave its subject union as a type parameter, letting `Strategy` classes narrow which `Subject`s they handle:

```typescript
abstract class CheckoutTemplate<SU extends CommandSubjectUnion<CheckoutCmd>> implements Template<
  CheckoutCmd,
  [AccessBuildingCommand],
  SU
> {
  readonly accessBuilding: AccessBuildingCommand;
  constructor(cmd: AccessBuildingCommand) {
    this.accessBuilding = cmd;
  }

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
    return { approved: true, days: student.year >= 3 ? 14 : 7 };
  }
}
```

This does not break LSP — a `StudentCheckout` is only returned for dispatches that route `Student`s to it.

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

```
command.run(subject, object)
  → subject.getCommandStrategy(command, object)     // double dispatch
    → command[subject.visitName](subject, object)   // visit method selects strategy
      → returns a Template                          // the chosen strategy
  → template.execute(subject, object)               // strategy executes
  → returns result
```

A **`Subject`** is an entity (`Student`, `Professor`, `Visitor`). A **`Command`** is an operation (`AccessBuilding`, `CheckoutEquipment`). Each `Command` declares one visit method per `Subject` — the visit method inspects the `Subject` and the context, then returns a **`Template`** to execute. A **`Strategy`** is a concrete `Template` subclass that narrows the subject union and provides the implementation. The `Template` may declare **hooks** — references to other `Command`s it invokes during execution.

## Odetovibe — YAML Configuration & Code Generation

For larger domains, define the Business-logics structure declaratively and let **Odetovibe** generate the TypeScript scaffolding:

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

#### CLI

```bash
# See all options
npx odetovibe --help

# Generate TypeScript scaffolding (default: merge mode — preserves existing method bodies)
npx odetovibe campus.yaml --out src/

# Unconditional overwrite — replaces all generated files
npx odetovibe campus.yaml --out src/ --overwrite

# Strict mode — writes .ode.ts alongside the original on conflict instead of overwriting
npx odetovibe campus.yaml --out src/ --no-overwrite
```

#### Library — three phases: Extract → Transform → Load

```typescript
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

- **Structural rails** — The protocol tells the LLM exactly where new code goes. "Add a `Contractor` subject to `AccessBuildingCommand`" has one unambiguous implementation path.
- **YAML as prompting surface** — Hand the [**Odetovibe**](https://www.npmjs.com/package/odetovibe) config to the LLM instead of describing changes in prose. Higher fidelity, lower ambiguity.
- **Compiler as guardrail** — Forgotten visit methods are compile errors, not silent bugs. The LLM gets immediate feedback.
- **Predictable file structure** — Each `Command` + `Template`s + `Strategy` classes lives in one file. No architectural decisions for the LLM to get wrong across iterations.

## Project Structure

```
codascon/                        # monorepo root
├── packages/
│   ├── codascon/                # published as "codascon"
│   │   ├── src/
│   │   │   ├── index.test.ts
│   │   │   └── index.ts         # Subject, Command, Template, Strategy + type machinery
│   │   └── README.md
│   └── odetovibe/               # published as "odetovibe"
│       ├── src/
│       │   ├── extract/         # parse YAML → validate → ConfigIndex
│       │   │   ├── commands/
│       │   │   │   └── validate-entry.ts
│       │   │   ├── domain-types.ts
│       │   │   ├── index.test.ts
│       │   │   └── index.ts
│       │   ├── load/            # ts-morph AST → write files to disk
│       │   │   ├── commands/
│       │   │   │   └── write-file.ts
│       │   │   ├── domain-types.ts
│       │   │   ├── index.test.ts
│       │   │   └── index.ts
│       │   ├── transform/       # ConfigIndex → ts-morph AST
│       │   │   ├── commands/
│       │   │   │   └── emit-ast.ts
│       │   │   ├── domain-types.ts
│       │   │   ├── index.test.ts
│       │   │   └── index.ts
│       │   ├── cli.ts           # bin entry: odetovibe <schema.yaml> --out <dir>
│       │   ├── index.ts         # library entry
│       │   └── schema.ts        # YamlConfig type definitions
│       ├── specs/               # odetovibe's own codascon domain specs
│       │   ├── extract.yaml     # extract phase domain config
│       │   ├── load.yaml        # load phase domain config
│       │   └── transform.yaml   # transform phase domain config
│       └── README.md
└── README.md
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
