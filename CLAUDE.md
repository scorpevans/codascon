# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**codascon** (Code As Config) is a TypeScript framework built around a single idea: when a domain has N entity types and M operations, the compiler should guarantee that every combination is handled — not tests, not runtime checks, the compiler.

It achieves this through a structural protocol of three primitives (`Subject`, `Command`, `Template`) and a type machinery layer that converts the protocol's constraints into compile-time errors. The result is exhaustive double-dispatch: adding an entity type without updating every operation is a compile error, not a runtime bug.

The runtime footprint is ~10 lines. Everything else is types.

## Monorepo Commands

```bash
pnpm install          # install all dependencies
pnpm build            # compile both packages (respects project reference order)
pnpm test             # run all tests (Vitest)
pnpm lint             # ESLint across all packages
pnpm lint:fix         # ESLint with auto-fix
pnpm format           # Prettier (write)
pnpm format:check     # Prettier (check only)
pnpm clean            # remove build artifacts
```

Per-package:

```bash
pnpm --filter codascon test
pnpm --filter codascon build
```

## Project Structure

pnpm monorepo with two published packages:

```
codascon/
├── package.json            # workspace root (private: true, name: codascon-workspace)
├── pnpm-workspace.yaml
├── tsconfig.base.json      # shared compiler options (ES2022, NodeNext, strict)
├── tsconfig.json           # root project references (files: [])
├── vitest.config.ts        # root vitest config — projects glob
├── eslint.config.js        # flat ESLint config (typescript-eslint + prettier)
├── .prettierrc             # Prettier config
├── .gitignore
├── README.md
└── packages/
    ├── codascon/           # published as "codascon" — pure framework, no runtime deps
    │   ├── package.json    # sideEffects: false, ESM-only exports
    │   ├── tsconfig.json   # composite: true, extends ../../tsconfig.base.json
    │   ├── vitest.config.ts
    │   └── src/
    │       ├── index.ts        # all exports: Subject, Command, Template + type utilities
    │       └── index.test.ts   # full test suite (16 sections, compile-time + runtime)
    └── odetovibe/          # published as "odetovibe" — YAML-to-TypeScript codegen
        ├── package.json    # bin: odetovibe, depends on codascon: workspace:*
        ├── tsconfig.json   # composite: true, references ../codascon
        └── src/
            ├── cli.ts      # bin entry (#!/usr/bin/env node): YAML → parse → validate → generate
            ├── index.ts    # library entry: re-exports all modules + schema types
            ├── schema.ts   # YamlConfigSchema TypeScript type definitions
            ├── parser/     # parse(yaml: string): YamlConfigSchema
            ├── generator/  # generate(schema: YamlConfigSchema): GeneratedFile[]
            └── validator/  # validate(schema: YamlConfigSchema): ValidationResult
```

Stack: pnpm workspaces · tsc project references · ESM-only (`"type": "module"`) · Vitest 3.x · TypeScript 5.7.x · ESLint 9 flat config · Prettier 3.x

## Core Architecture

### The Three Primitives

**`Subject`** (abstract class)

The entities of the domain — things that _are_ something (`Student`, `Professor`, `Document`). Each Subject declares a unique string literal `visitName` (by convention prefixed with `"resolve"`, e.g., `"resolveStudent"`). This literal is the routing key: it names the method a Command must implement to handle this Subject.

**`Command<B, O, R, CV>`** (abstract class)

The operations of the domain — things that _happen_ (`AccessBuilding`, `CheckoutEquipment`). Each Command must implement one handler method per Subject in its declared union `CV` — the method name matches the Subject's `visitName`. The handler receives the Subject and a context object, inspects both, and returns a `Template` (the execution strategy for this combination).

Generic params: `B` = base type all Subjects share · `O` = context/payload type · `R` = return type (may be `Promise<T>`) · `CV` = tuple of handled Subject types

The `run(subject, object)` method orchestrates dispatch. Its `this` parameter is constrained to the intersection of all required handlers — if any handler is missing, `run` is uncallable at the call site.

**`Template<C, H, CSU>`** (type alias)

The execution contract. A Template combines an `execute(subject, object): R` method with structural properties for any hook Commands it depends on during execution (`CommandHooks<H>`). Templates are typically abstract classes (with concrete Strategy subclasses) or concrete classes when no variation is needed. The `CSU` parameter lets a Template narrow which Subjects it handles — Strategies can further narrow this.

Generic params: `C` = the Command this serves · `H` = tuple of hook Commands (other Commands invoked during execute) · `CSU` = subject union subset (defaults to full union)

### Dispatch Flow

```
command.run(subject, object)
  → subject.getCommandStrategy(command, object)
    → command[subject.visitName](subject, object)   // handler selected by visitName key
      → returns a Template instance
  → template.execute(subject, object)
  → returns R
```

### Type Safety Guarantees

The type machinery (`CommandSubjectStrategies`, `UnionToIntersection`, `CommandHooks`) enforces these at compile time — no decorators, no runtime reflection:

- **Exhaustive handlers**: Any missing handler method makes `run()` uncallable at the call site
- **Literal `visitName`**: Non-literal `string` types produce `never` keys, making exhaustiveness impossible to satisfy
- **Duplicate `visitName`**: Two Subjects with the same `visitName` in one Command's union produce an impossible intersection type for the handler
- **Hook structural requirement**: Declaring `Template<C, [AuditCommand]>` without an `audit` property fails at the `implements` site
- **Subject union enforcement**: `run()` rejects Subjects not in the Command's declared union
- **Return type enforcement**: Handler returning wrong type makes `run()` uncallable

### Key Exported Types

- `SubjectVisitName<S>` – Extracts the `visitName` literal from a Subject (`never` for non-literals)
- `CommandName<C>` – Extracts the `commandName` literal from a Command
- `CommandObject<C>` – Extracts the context/payload type `O` from a Command
- `CommandReturn<C>` – Extracts the return type `R` from a Command

### Internal Type Machinery (`packages/codascon/src/index.ts`)

- `UnionToIntersection<U>` – Converts a union to an intersection; the mechanism behind exhaustiveness checking and duplicate visitName detection
- `CommandSubjectStrategies<C>` – Computes the full intersection of required handler methods; used as the `this` constraint on `run()`
- `CommandHooks<H>` – Maps a tuple of hook Commands to required structural properties on a Template, keyed by `commandName`
- `SubjectUnionVisitors<CSU, H>` – Validates that hook Commands cover the Template's subject union (enforced at invocation site due to TypeScript limitation in constraint position)

## Client Implementation Pattern

```typescript
// Entities
class Student extends Subject {
  readonly visitName = "resolveStudent" as const;
  constructor(
    public readonly name: string,
    public readonly department: string,
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

// Operation — handler method names match visitName values
class AccessCommand extends Command<Person, Building, AccessResult, [Student, Professor]> {
  readonly commandName = "access" as const;

  resolveStudent(s: Student, b: Readonly<Building>): Template<AccessCommand, [], Student> {
    return s.department === b.department ? new GrantAccess() : new DenyAccess();
  }
  resolveProfessor(p: Professor, b: Readonly<Building>): Template<AccessCommand, [], Professor> {
    return new GrantAccess();
  }
}

// Execution contract (abstract, with Strategy subclasses)
abstract class AccessTemplate<CSU extends Student | Professor> implements Template<
  AccessCommand,
  [AuditCommand],
  CSU
> {
  readonly audit = new AuditCommand();
  execute(subject: CSU, object: Building): AccessResult {
    this.audit.run(subject, { action: "access" });
    return this.doAccess(subject, object);
  }
  protected abstract doAccess(subject: CSU, object: Building): AccessResult;
}

// Concrete strategy
class GrantAccess extends AccessTemplate<Student | Professor> {
  protected doAccess(s: Student | Professor, b: Building) {
    return { granted: true, reason: `${s.name} has access` };
  }
}
```

## Package Publishing

`codascon` is published to npm. `odetovibe` is not yet published (stubs not implemented).

**`packages/codascon/package.json` key fields:**

- `sideEffects: false` — fully tree-shakeable
- `"type": "module"` — ESM-only
- `exports` — single `.` export with `import` + `types` conditions
- `prepublishOnly: "pnpm build && pnpm test"` — build + test gate on publish
- Version scheme: CalVer `yyyy.M.d-alpha` (e.g. `2026.2.27-alpha`) — valid semver, no leading zeros in month/day

**To publish codascon:**

```bash
pnpm login                                        # once
pnpm --filter codascon publish --access public
```

## odetovibe Notes

`odetovibe` is both a **library** (`import { parse, validate, generate } from "odetovibe"`) and a **CLI** (`odetovibe schema.yaml --out src/`). When implementing its build, prefer `tsup` over bare `tsc` — it handles the `#!/usr/bin/env node` shebang, executable bit (`chmod +x`), and library+binary split in one pass. The `parser`, `validator`, and `generator` modules are currently stubs that throw `Error("Not implemented")`.

## YAML Schema

`packages/odetovibe/src/schema.ts` defines the `YamlConfigSchema` type — the declarative vocabulary for describing a codascon domain. Key structural rules:

- Every Subject in a Command's `subjectUnion` must appear in its `dispatch` map
- `visitName` must be unique within a Command's union and use the `"resolve"` prefix
- Template `subjectSubset` must be a subset of its Command's `subjectUnion`
- Strategy `subjectSubset` must be a subset of its parent Template's `subjectSubset`
- Templates with a non-empty `strategies` map are abstract; those with `strategies: {}` are concrete
- Strategies may only override hook keys declared by their parent Template
