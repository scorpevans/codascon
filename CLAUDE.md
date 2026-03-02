# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Top Priority: Load Relevant Memories Before Engaging

**Consider this on every prompt, before taking any action. Never skip for convenience — confidence that you already know the content is not a reason to skip this step.**

**At the start of a session, or when first encountering a topic area within a conversation, read the relevant memory topic files before writing any code or forming a plan.**

MEMORY.md is auto-loaded but contains only a concise index. The detail lives in topic files that must be read explicitly.

When to load:

- **New session**: no topic files have been read yet — load all relevant ones before the first task
- **New topic within a session**: if a task touches an area not yet covered in this conversation, read the relevant file before proceeding
- **After context compression**: if the conversation has been auto-compressed, earlier reads may have been dropped — reload if the content feels absent

When NOT to reload:

- **Same session, already read**: if the file was read earlier in this conversation, its content is still in context — do not re-read it

This prevents repeating past mistakes (bad patterns already documented) and honours past decisions (architectural choices already recorded).

## Top Priority: Keep This File and Memory Files Current

**Consider this on every prompt, before ending any task. Never skip for convenience — do not defer recording on the assumption you will remember it later.**

**Whenever you learn something new — a constraint, a gotcha, a decision, a failed approach — record it immediately** in the right place. Do not wait until the end of a session.

Where it goes:

- **CLAUDE.md** — principles, project structure, publishing
- **`memory/codascon-architecture.md`** — four primitives, dispatch flow, type safety guarantees, client pattern, internal type machinery, ETL design, YAML schema rules
- **`memory/typescript-gotchas.md`** — TypeScript type system constraints and failed approaches
- **`memory/workflows.md`** — pre-approved workflows, exact shell command patterns (commit, PR, push, build, test)
- **`memory/MEMORY.md`** — concise index only; update when topic files are added or reorganised

If a new topic area emerges that does not fit existing files, create a new topic file, add it to the Memory Organization section in this file, and add a pointer in MEMORY.md.

## Top Priority: Clean Slate Before New Approaches

**Consider this on every prompt where you pivot approach. Never skip for convenience — do not carry forward changes just because reverting them feels like lost work.**

**Before pivoting to a new implementation approach, always establish a clean slate:**

```bash
git restore <file>   # revert a specific file
git restore .        # revert all working-tree changes
```

Only carry existing changes forward into a new approach if **all of them are directly relevant** to that new approach. Any change that does not serve the new direction must be reverted first. This prevents stale artefacts (dead properties, outdated comments, unused types) from accumulating across failed attempts.

**Before cleaning, all three conditions must be met:**

1. **Verify the work exists elsewhere** — the slate may only be cleaned if the work being discarded is recoverable (committed to a branch, stashed, saved in a file, or documented). Work that exists only in the working tree and has not been saved anywhere must not be silently discarded.
2. **Notify before cleaning** — state exactly what will be removed and how to recover it (e.g. `git stash pop`, the branch name, the file path).
3. **If unrecoverable, stop** — if the work cannot be recovered after cleaning, do not proceed. Instead, apply the "Confirm Before Irreversible Actions" principle and wait for explicit confirmation.

## Top Priority: Confirm Before Irreversible Actions

**Consider this on every prompt, before taking any action. Never skip for convenience — do not proceed on the assumption that the user implicitly accepts the loss.**

**Before taking any action that cannot be reversed**, stop and explicitly confirm with the user. This includes but is not limited to:

- Discarding uncommitted changes that are not saved elsewhere (`git restore`, `git reset --hard`, `git clean`)
- Force-pushing to a shared branch
- Deleting files, branches, or database records
- Overwriting content that has no backup

**The confirmation must include:**

1. What will be permanently lost or changed
2. Why the action is necessary
3. Whether any recovery path exists

Only proceed after receiving an explicit **yes** from the user.

## Top Priority: Honor Past Decisions When Reversing Course

**Consider this on every prompt, before proposing any reversal. Never skip for convenience — do not skip the acknowledgement step because the reversal feels obviously correct.**

**Before proposing to undo, revert, or change a previous decision, explicitly acknowledge why that decision was made.**

The pattern to follow:

1. **State the original reason** — why was the current approach chosen? What problem was it solving?
2. **Name the new tension** — what new information, constraint, or trade-off makes the original choice problematic?
3. **Then propose the change** — only after steps 1 and 2 are stated clearly.

Without step 1, reversals look arbitrary and risk re-introducing the original problem. Without step 2, there is no basis for changing course. Skipping either step leads to circular churn — solving problem A, then undoing it, then rediscovering A.

This applies to: error message formats, type machinery approaches, naming conventions, file structure, API shape, or any other deliberate design decision recorded in this file or in session history.

## Top Priority: Follow Established Workflows Exactly

**Consider this on every prompt, before executing any git or PR step. Never skip for convenience — believing you already know the pattern is not a reason to skip reading `workflows.md`; it is the most common reason mistakes happen.**

**Before executing any git or PR workflow step, read `workflows.md` first — no exceptions, even when you believe you already know the pattern.** Confidence is the failure mode: rules are violated precisely when they feel unnecessary.

The exact patterns for commits, PR creation, push, build, and test are in `workflows.md`. Do not reconstruct them from memory.

## Top Priority: Reason Before Acting

**Consider this on every prompt, before taking any action. Never skip for convenience — feeling confident or certain is not a reason to skip this step; it is a signal to apply it more carefully.**

**Step 1: Understand the intention.** An instruction is a means to an end — not the end itself. Before thinking about _how_ to implement, ask _why_: what is the user trying to achieve? Form a concrete guess at the underlying intention. This guess is the lens through which better alternatives become visible. Without it, you optimise within the instruction's frame rather than toward the user's actual goal.

If your guesses at the intention are wildly divergent — the instruction could plausibly mean very different things — that is a reasonable basis to ask for clarification before proceeding.

**Step 2: Reason from that intention.** Once you have a working hypothesis of the goal, ask:

- Is the stated approach the best way to achieve it?
- Are there hidden costs, edge cases, or better alternatives?
- Does it conflict with existing architecture or constraints?

**If something seems wrong or suboptimal, push back.** Explain the concern clearly, offer alternatives or your own opinion, and wait for acknowledgement.

**If the user insists after your pushback**, ask one final yes/no confirmation before proceeding — default answer is **no**. Include a concise warning stating exactly why you disagree. Only a clear "yes" from the user moves forward.

## Project Overview

**codascon** is a structural protocol for code organization, in accordance with established design patterns and SOLID principles, and with exhaustive compile-time type checking. When a domain has N entity types and M operations, the compiler guarantees that every combination is handled — not tests, not runtime checks, the compiler.

It achieves this through four primitives (`Subject`, `Command`, `Template`, `Strategy`) and a type machinery layer that converts the protocol's constraints into compile-time errors. The result is exhaustive double-dispatch: adding an entity type without updating every operation is a compile error, not a runtime bug.

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
    │       ├── index.ts        # all exports: Subject, Command, Template + type utilities (SubjectVisitName, CommandName, CommandObject, CommandReturn, CommandSubjectUnion)
    │       └── index.test.ts   # full test suite (16 sections, compile-time + runtime)
    └── odetovibe/          # published as "odetovibe" — YAML-to-TypeScript codegen
        ├── package.json    # bin: odetovibe, depends on codascon: workspace:*
        ├── tsconfig.json   # composite: true, references ../codascon
        └── src/
            ├── cli.ts          # bin entry: extract → transform → load pipeline
            ├── index.ts        # library entry: re-exports all three phases + schema types
            ├── schema.ts       # YamlConfig type (config instance) + YamlConfigSchema rules
            ├── extract.yaml    # extract phase domain config
            ├── transform.yaml  # transform phase domain config
            ├── load.yaml       # load phase domain config
            ├── extract/        # phase 1: YAML → ConfigIndex
            │   ├── domain-types.ts       # Subject classes + ConfigIndex, ValidationResult
            │   ├── index.ts              # parseYaml(), validateYaml()
            │   └── commands/
            │       └── validate-entry.ts # ValidateEntryCommand + 6 validator Templates
            ├── transform/      # phase 2: ConfigIndex → ts-morph AST
            │   ├── domain-types.ts       # EmitContext, EmitResult
            │   ├── index.ts              # emitAst()
            │   └── commands/
            │       └── emit-ast.ts       # EmitAstCommand + 6 emitter Templates
            └── load/           # phase 3: ts-morph AST → disk
                ├── domain-types.ts       # WriteContext, WriteResult, WriteMode
                ├── index.ts              # writeFiles()
                └── commands/
                    └── write-file.ts     # WriteFileCommand + 3 writer Templates
```

Stack: pnpm workspaces · tsc project references · ESM-only (`"type": "module"`) · Vitest 3.x · TypeScript 5.7.x · ESLint 9 flat config · Prettier 3.x

## Package Publishing

Both packages are published to npm.

| Package     | Version scheme                                  | npm       |
| ----------- | ----------------------------------------------- | --------- |
| `codascon`  | CalVer `yyyy.M.d-alpha` (e.g. `2026.3.1-alpha`) | published |
| `odetovibe` | CalVer `yyyy.M.d` (e.g. `2026.3.1`)             | published |

Note: `codascon` carries `-alpha` to signal the API is still stabilising; `odetovibe` does not.

**Both `package.json` files share these key fields:**

- `sideEffects: false` — fully tree-shakeable
- `"type": "module"` — ESM-only
- `exports` — single `.` export with `import` + `types` conditions
- `prepublishOnly: "pnpm build && pnpm test"` — build + test gate on publish

**To publish:**

```bash
pnpm login                                         # once
pnpm --filter codascon publish --access public
pnpm --filter odetovibe publish --access public
```

## Memory Organization

All memory files live in `.claude/projects/.../memory/` (user-level, not checked into the repo).

| File                       | Auto-loaded                  | Purpose                                                                                                                                                          |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEMORY.md`                | Yes (truncated at 200 lines) | Concise index — repo structure, key commands, behavioral rules, pointers to topic files                                                                          |
| `codascon-architecture.md` | No — read on demand          | Four primitives, dispatch flow, type safety guarantees, client implementation pattern, internal type machinery, odetovibe ETL pipeline design, YAML schema rules |
| `typescript-gotchas.md`    | No — read on demand          | TypeScript type system constraints specific to this codebase, failed approaches not to re-introduce                                                              |
| `workflows.md`             | No — read on demand          | Pre-approved workflows with exact shell command patterns; single source of truth for commit, PR, push, build, test                                               |

**Keep this table current.** When a new topic file is created, add a row here and a pointer in MEMORY.md. When a topic file is removed or renamed, update both places. An out-of-date table defeats the purpose — Claude will not know to look for files it does not know exist.

### Executing Pre-Approved Workflows

Read `workflows.md` before executing any workflow listed there. Then:

- **Ask once** — request permission at the start of the workflow, not before each individual step.
- **Execute without interruption** — once started, run all steps in sequence without prompting.
- **Re-ask mid-workflow** if an event forces a deviation from the documented steps — for example: a step fails, an unexpected error requires a recovery action, or completing the workflow would require interleaving steps not listed in the workflow. State what happened, what you propose to do instead, and wait for approval before continuing.
