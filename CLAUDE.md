# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Top Priority: Load Relevant Memories Before Engaging

**Consider this on every prompt, before taking any action. Never skip for convenience — confidence that you already know the content is not a reason to skip this step.**

**When first encountering a topic area within a conversation, read the relevant memory topic files before answering or writing any code or forming a plan.**

MEMORY.md is auto-loaded but contains only a concise index. The detail lives in topic files that must be read explicitly.

**Once the conversation or task has been accomplished, compact your context window**

The conversation or task is done when the next prompt is an unrelated task or question.

## Top Priority: Keep This File and other Memory Files Current

**Consider this on every prompt, before ending any task. Never skip for convenience — do not defer recording on the assumption you will remember it later.**

This prevents repeating past mistakes (bad patterns already documented) and honours past decisions (architectural choices already recorded).

**Whenever you learn something new — a constraint, a gotcha, a decision, a failed approach — record it immediately** in the right memory file. Do not wait for the next prompt. See the Memory Organization table below for where each topic belongs.

## Memory Organization

All memory files live in `.claude/projects/.../memory/` (user-level, not checked into the repo). Use this table to decide where new learnings belong.

| File                       | Auto-loaded                  | Where it belongs / Purpose                                                                                                                                                                                                      |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEMORY.md`                | Yes (truncated at 200 lines) | Concise index — repo structure, key commands, behavioral rules, pointers to topic files                                                                                                                                         |
| `codascon-architecture.md` | No — read on demand          | Project structure (monorepo tree), four primitives, dispatch flow, type safety guarantees, client implementation pattern, internal type machinery, odetovibe ETL pipeline design, YAML schema rules, README/npm rendering notes |
| `typescript-gotchas.md`    | No — read on demand          | TypeScript type system constraints specific to this codebase, failed approaches not to re-introduce                                                                                                                             |
| `workflows.md`             | No — read on demand          | All monorepo commands; pre-approved workflows with exact shell command patterns; single source of truth for commit, PR, push, build, test, and package publishing configuration                                                 |

**Keep this table current.** If a new topic area emerges that does not fit existing files, suggest creating a new topic file, and upon approval add it here and add a pointer in MEMORY.md. An out-of-date table defeats the purpose — Claude will not know to look for files it does not know exist.

## Top Priority: Reason Before Acting

**Consider this on every prompt, before taking any action. Never skip for convenience — feeling confident or certain is not a reason to skip this step; it is a signal to apply it more carefully.**

**Step 1: Understand the intention.** An instruction is a means to an end — not the end itself. Before thinking about _how_ to answer or implement, ask _why_: what is the user trying to achieve? Form a concrete guesses at the underlying intention. These guesses are the lens through which better alternatives become visible. Without it, you optimise within the instruction's frame rather than toward the user's actual goal.

If your guesses at the intention are divergent — the instruction could plausibly mean very different things — therefore ask for clarification before proceeding.

**Step 2: Reason from that intention.** Once you have a working hypothesis of the goal, consider:

- Is the stated approach the best way to achieve it?
- Are there hidden costs, edge cases, or better alternatives?
- Does it conflict with existing architecture or constraints?

**If something seems wrong or suboptimal, push back.** Explain the concern clearly, offer alternatives or your own opinion, and wait for acknowledgement.

**If the user insists after your pushback**, ask one final yes/no confirmation before proceeding — default answer is **no**. Include a concise warning stating exactly why you disagree. Only a clear "yes" from the user moves forward.

## Top Priority: Honor Past Decisions When Reversing Course

**Consider this on every prompt, before proposing any reversal. Never skip for convenience — do not skip the acknowledgement step because the reversal feels obviously correct.**

**Before proposing to undo, revert, or change a previous decision, explicitly acknowledge why that decision was made.**

The pattern to follow:

1. **State the original reason** — why was the current approach chosen? What problem was it solving?
2. **Name the new tension** — what new information, constraint, or trade-off makes the original choice problematic?
3. **Then propose the change** — only after steps 1 and 2 are stated clearly.
4. **Record the learning in relevant files** - once the change has been approved.

Without step 1, reversals look arbitrary and risk re-introducing the original problem. Without step 2, there is no basis for changing course. Skipping either step leads to circular churn — solving problem A, then undoing it, then rediscovering A.

This applies to: error message formats, type machinery approaches, naming conventions, file structure, API shape, or any other deliberate design decision recorded in this file or in session history.

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

## Top Priority: Clean Slate Before New Approaches

**Consider this on every prompt where you pivot approach. Never skip for convenience — do not carry forward changes just because reverting them feels like lost work.**

**Before pivoting to a new implementation approach, always establish a clean slate:**.

- Document the learnings necessitating the pivot into the relevant memory files
- Create a new version of the current branch's name e.g. privot-branch-v2
- The new branch should be freshly checked-out from main
- Relevant diffs from the old branch can be patched into the new branch

This prevents stale artefacts (dead properties, outdated comments, unused types) from accumulating across failed attempts. The different branch versions also allows to smoothly go back to an earlier approach.

## Top Priority: Follow Established Workflows Exactly

**Consider this on every prompt, before executing any git or PR step. Never skip for convenience — believing you already know the pattern is not a reason to skip reading `workflows.md`; it is the most common reason mistakes happen.**

**Before executing any git or PR workflow step, read `workflows.md` first — no exceptions, even when you believe you already know the pattern.** Confidence is the failure mode: rules are violated precisely when they feel unnecessary.

The exact patterns for commits, PR creation, push, build, and test are in `workflows.md`. Do not reconstruct them from memory alone.

### Executing Pre-Approved Workflows

Read `workflows.md` before executing any workflow listed there. Then:

- **Ask once** — request permission at the start of the workflow, not before each individual step.
- **Re-ask mid-workflow** if an event forces a deviation from the documented steps — for example: a step fails, an unexpected error requires a recovery action, or completing the workflow would require interleaving steps not listed in the workflow. State what happened, what you propose to do instead, and wait for approval before continuing.
- **Document any new learning in the relevant files** when the workflow doesn't follow the documented steps, and new decisions had to be made.
- **Execute without interruption** — once started, run all steps in sequence without prompting, unless there's a deviation as described above.

## Top Priority: Never Reference Untracked Files

**Consider this on every prompt, before any git action. Never skip for convenience — referencing an untracked file reveals its existence, even if the file itself is never committed.**

**Never reference an untracked file in git or in any tracked file without explicit user approval.** This includes `.gitignore` entries, commit messages, PR titles, PR bodies, code comments, and any other tracked content. Untracked files are untracked for a reason — do not expose that reason in the repository history.

This means:

- Do not add an untracked file to `.gitignore` without explicit approval
- Do not name an untracked file in a commit message or PR body
- Do not stage or commit an untracked file without explicit approval
- If an untracked file appears in `git status` output during a workflow step, ignore it silently

## Project Overview

**codascon** is a structural protocol for code organization, in accordance with established design patterns and SOLID principles, and with exhaustive compile-time type checking. When a domain has N entity types and M operations, the compiler guarantees that every combination is handled — not tests, not runtime checks, the compiler.

It achieves this through four primitives (`Subject`, `Command`, `Template`, `Strategy`) and a type machinery layer that converts the protocol's constraints into compile-time errors. The result is exhaustive double-dispatch: adding an entity type without updating every operation is a compile error, not a runtime bug.

The runtime footprint is ~10 lines. Everything else is types.
