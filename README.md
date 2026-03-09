# codascon

[![CI](https://github.com/scorpevans/codascon/actions/workflows/ci.yml/badge.svg)](https://github.com/scorpevans/codascon/actions/workflows/ci.yml)
[![npm codascon](https://img.shields.io/npm/v/codascon?label=codascon)](https://www.npmjs.com/package/codascon)
[![npm odetovibe](https://img.shields.io/npm/v/odetovibe?label=odetovibe)](https://www.npmjs.com/package/odetovibe)
[![license](https://img.shields.io/npm/l/codascon)](./LICENSE)

**A structural protocol for code organization with exhaustive compile-time type checking.**

**Codascon** distills high-level design patterns and SOLID principles into a zero-overhead TypeScript protocol. You describe what your domain looks like — which entities exist, which operations apply to them, and which strategies handle each combination — and your architectural intent is guarded with mathematical certainty. If a single edge case is unhandled, the compiler won't just warn you — it will stop you.

For larger domains, [**Odetovibe**](https://www.npmjs.com/package/odetovibe) pairs with it to generate TypeScript scaffolding from a declarative YAML schema — keeping your business logic pure and your architecture predictable and unbreakable.

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

Codascon's implementation in TypeScript provides exhaustive compile-time type checking; the dispatch mechanism will not fail at runtime. In other languages, the structural protocol still applies and brings the same organizational benefits, and the compile-time safety would depend on the extent of the implementation of Codascon as constrained by the language's type system.

**2. Bounded scope of change**

There is no N×M coverage matrix to keep in your head — the type system holds it. When a new `Subject` is added, every `Command` that must handle it shows a compile error at the exact call site. When a business rule changes for a specific entity-operation pair — say, extending how `Orders` are processed — you add a `Strategy` to the relevant `Command` and update its resolver logic. You do not have to consider the rest of the codebase.

**3. Code architecture in YAML**

Codascon provides a consistent schema for expressing code architecture. Every domain built on it follows the same structural shape — `Subject`s, `Command`s, `Templates`, and `Strategies` — with no dialect variation across codebases or teams. Via [**Odetovibe**](https://www.npmjs.com/package/odetovibe), that architecture can be expressed in a declarative YAML schema and scaffolded directly into code, giving you a versioned, reviewable record of your domain structure, separate from implementation. Because the schema is structured and human-readable, non-coders can read it directly — or render it into flowcharts and diagrams — to visualize and reason about the system's architecture without touching the code.

**4. Structural rails for AI-generated code (Vibe coding)**

With a formal protocol in place, an LLM can generate structurally correct code by construction. The same business logic produces the same code — regardless of which model generated it or when. You focus on the business domain; the protocol ensures the output is consistent and auditable.

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

A **`Subject`** is an entity (`Student`, `Professor`). Codascon enforces that each `Subject` declares a `resolverName` — the name of the resolver method it expects its `Command`s to implement.

```typescript
import { Subject } from "codascon";

class Student extends Subject {
  readonly resolverName = "resolveStudent" as const;
  clearance = "basic";
}

class Professor extends Subject {
  readonly resolverName = "resolveProfessor" as const;
  clearance = "full";
}
```

### Define a Command

A **`Command`** is an operation (`AccessBuildingCommand`). Codascon enforces (at the call site) that a `Command` implements the resolver method per `Subject` that it operates on — the resolver method inspects the `Subject` and the context, then returns a **`Template`** to execute.

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
    return new StudentAccess(); // Strategy — defined below
  }

  resolveProfessor(_professor: Professor, _building: Building) {
    return new ProfessorAccess(); // Strategy — defined below
  }
}
```

### Define a Template and Strategies

A `Template` abstract class implements how a `Command` is executed. It may be configured to handle only a subset of the `Command`'s `Subject` union and may declare **hooks** — references to other `Command`s it invokes during execution (see Advanced Patterns below). `Strategy` classes extend those implementations.

```typescript
import { type Template, type CommandSubjectUnion } from "codascon";

abstract class AccessTemplate implements Template<AccessBuildingCommand> {
  execute(_subject: CommandSubjectUnion<AccessBuildingCommand>, building: Building): AccessResult {
    return this.tryAccess(building);
  }
  protected abstract tryAccess(building: Building): AccessResult;
}

class StudentAccess extends AccessTemplate {
  protected tryAccess(building: Building): AccessResult {
    return { granted: true, reason: `student can access ${building.name} through the front door` };
  }
}

class ProfessorAccess extends AccessTemplate {
  protected tryAccess(building: Building): AccessResult {
    return { granted: true, reason: `professor can access ${building.name} through the back door` };
  }
}
```

### Run

```typescript
const cmd = new AccessBuildingCommand();
const result = cmd.run(new Professor(), { name: "Science Hall", department: "CS" });
// { granted: true, reason: "professor can access Science Hall through the back door" }
```

```
command.run(subject, object)
  → subject.getCommandStrategy(command, object)     // double dispatch
    → command[subject.resolverName](subject, object)   // resolver method selects strategy
      → returns a Template                          // the chosen strategy
  → template.execute(subject, object)               // strategy executes
  → returns result
```

## Advanced Patterns

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

## Odetovibe — YAML Configuration & Code Generation

Instead of jumping straight into coding, you can focus on architecting your business logic and let **Odetovibe** generate the TypeScript scaffolding:

```yaml
namespace: campus

domainTypes:
  CampusMember: {}
  Student:
    resolverName: resolveStudent
  Professor:
    resolverName: resolveProfessor
  Building: {}
  AccessResult: {}

commands:
  AccessBuildingCommand:
    commandName: accessBuilding
    baseType: CampusMember
    objectType: Building
    returnType: AccessResult
    subjectUnion: [Student, Professor]
    dispatch:
      Student: StudentAccess
      Professor: ProfessorAccess
    templates:
      AccessTemplate:
        isParameterized: false
        strategies:
          StudentAccess: {}
          ProfessorAccess: {}
```

### Translate YAML architecture to Code

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

> **Odetovibe is self-hosted** — its own ETL pipeline is built entirely on the codascon protocol, described in YAML, and its TypeScript scaffolding is generated by odetovibe itself.

## AI-Assisted Development

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
Here are the generated TypeScript files from the codascon scaffolding. Each template has a concrete `execute` stub marked `// @odetovibe-generated` — implement the business logic there. Strategies inherit from their template and can override `execute` if needed.

Here are the YAML code configurations:
[LINK YOUR YAML CONFIG(S)]

Source code generated by odetovibe:
src/

Implement the business logic for each stub based on the following rules:

[INSERT YOUR BUSINESS RULES]

Do not modify any class declarations, constructor signatures, or method signatures — only fill in the method bodies and define any new Base Types as needed.
```

> **Note:** You can return to steps 1 and 2 at any time to iterate on your YAML config. Rerun the odetovibe command and all updates will be merged into your existing files, preserving any business logic you have already implemented.

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
