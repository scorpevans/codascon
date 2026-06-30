/*
 * codascon — code as config
 *
 * A structural protocol for code architecture with exhaustive compile-time type checking.
 *
 * ## Core Concepts
 *
 * **Subject** — An entity that participates in double dispatch. Each Subject
 * declares a unique `resolverName` string literal (e.g. `"resolveStudent"`) which
 * the framework uses to route dispatch to the correct resolver method on a Command.
 * Subjects extend the abstract `Subject` base class.
 *
 * **Command** — An operation that can be performed on Subjects. A Command
 * declares resolver methods — one per Subject in its subject union — each named
 * after that Subject's `resolverName`. The resolver method receives the Subject and
 * the operation's object (context/payload), inspects both, and returns a
 * Template (strategy) to execute. Commands extend the abstract `Command` base
 * class, which provides the `run` method that orchestrates dispatch.
 *
 * **Template** — The strategy interface. A Template declares an `execute`
 * method and optionally declares CommandHooks (references to other Commands
 * that the strategy may invoke during execution). In client code, Templates
 * are typically implemented as abstract classes, with concrete Strategies
 * extending them.
 *
 * **MiddlewareCommand** — A Command subclass that intercepts dispatch.
 * Middleware receives the subject, object, and `inner` (a `Runnable` representing
 * the next step in the chain), and can run logic before and after calling
 * `inner.run()`. Registered at the command level via `Command.middleware`:
 * wraps the full dispatch cycle — resolver method selection and execute —
 * for every Subject. The first element in the array is the outermost layer.
 *
 * ## Dispatch Flow
 *
 * Every command — middleware or not — follows the same two-phase procedure,
 * applied recursively through the chain:
 *
 * ```
 * command.run(subject, object)
 *   → _runChain: for each command in [command.middleware..., command]:
 *       → _dispatch: subject.getCommandStrategy(command, object)
 *           → command[subject.resolverName](subject, object)  // specific resolver, or
 *           → command.defaultResolver(subject, object)          //   defaultResolver fallback
 *           → returns a Template instance
 *         → strategy.execute(subject, object)           // regular command
 *         → strategy.execute(subject, object, inner)    // middleware command
 *             // inner = continuation: the next step in the enclosing chain
 *   ← chain unwinds, returns R
 * ```
 *
 * Because every step uses `_runChain` / `_dispatch`, middleware registered on
 * a middleware command are automatically applied — no special casing.
 *
 * ## Type Safety Guarantees
 *
 * - **Exhaustive resolver methods**: A Command's `run` method has a `this` parameter
 *   constrained by `CommandSubjectStrategies<C, CommandResolvedSubjects<C>>`, which maps
 *   each *resolved* Subject's `resolverName` to its required resolver method signature.
 *   If any resolver method is missing, `run` becomes uncallable at the call site.
 *
 * - **Typed default-resolution partition**: A Command's subjects are split into a
 *   *resolved* tuple (`BRS`) and a *defaulted* tuple (`BDS`). Resolved subjects require
 *   specific resolver methods; defaulted subjects are handled by `defaultResolver`,
 *   which `run` requires (typed to `CommandDefaultedSubjects<C>`) exactly when `BDS`
 *   is non-empty. Because the two halves are declared separately, a forgotten subject
 *   is a compile error — not silently absorbed by `defaultResolver`. With `BDS = []`
 *   (the default) the Command is fully exhaustive and no `defaultResolver` is expected.
 *
 * - **Subject union enforcement**: `run` only accepts Subjects in the Command's full
 *   subject union (`CommandSubjectUnion<C>` = `BRS[number] | BDS[number]`). Passing an
 *   unsupported Subject is a compile error.
 *
 * - **Literal resolverName**: `SubjectResolverName<S>` returns `never` for non-literal
 *   `string` resolverNames. When `never` is a mapped type key the entry is dropped,
 *   so resolver method requirements for Subjects with non-literal resolverNames are
 *   omitted from `CommandSubjectStrategies` — and `ValidResolverNames`
 *   makes `run` uncallable with a descriptive error property name.
 *
 * - **Duplicate resolverName detection**: If two Subjects in the same Command's
 *   union share a `resolverName`, `CommandSubjectStrategies` produces two entries
 *   with the same key; TypeScript intersects them into an impossible method
 *   signature (e.g. `(s: Dog) => ... & (s: Cat) => ...`), making the visit
 *   method unimplementable.
 *
 * - **Hook presence and subject coverage**: `CommandHooks<H, SU>` requires the
 *   Template to have a property for each hook Command, keyed by `commandName`,
 *   AND enforces that each hook Command declares resolver methods for every Subject
 *   in `SU`. A hook missing any required resolver method resolves to an error string
 *   at the `implements` site — no value of the hook's class satisfies the string
 *   literal type, producing a compile error.
 *
 * ## Client Patterns
 *
 * **Template as abstract class with Strategies:**
 * ```ts
 * abstract class AccessTemplate<SU extends CommandSubjectUnion<AccessCommand>>
 *   implements Template<AccessCommand, [AuditCommand], SU>
 * {
 *   abstract readonly audit: AuditCommand;  // hook — instantiated by Strategy
 *
 *   execute(subject: SU, object: Building): AccessResult {
 *     this.audit.run(subject, { action: "access" });
 *     return this.doAccess(subject, object);
 *   }
 *
 *   protected abstract doAccess(subject: SU, object: Building): AccessResult;
 * }
 *
 * class GrantAccess extends AccessTemplate<Student> {
 *   readonly audit = new AuditCommand();
 *   protected doAccess(s: Student, b: Building) { return { granted: true }; }
 * }
 * ```
 *
 * **Hooks can be:**
 * - Abstract on the Template, instantiated by the Strategy
 * - Concrete on the Template (shared across all Strategies)
 * - Overridden by the Strategy
 * - Injected via constructor during strategy resolution in the Command's resolver method
 *
 * **SU parameterization:**
 * A Template can parameterize its SU (`T<SU extends ...>`), allowing Strategies
 * to narrow which Subjects they handle. This does not break LSP — a
 * `GrantAccess extends AccessTemplate<Student>` is a valid strategy for any
 * dispatch that routes Students to it.
 *
 * **Async support:**
 * Set `R = Promise<Result>` on the Command. Resolver methods (strategy selection)
 * remain synchronous; only `execute` returns the Promise.
 */

// ─── Type Utilities (exported) ───────────────────────────────────

/*
 * The minimal interface required to invoke a middleware continuation.
 *
 * Declare `inner` as `Runnable<T, O, R>` (where T is the same type parameter as
 * `execute`'s `subject: T`) rather than as the full Command type. `Runnable` accurately
 * describes the only safe operation on `inner`: calling `run()`. The framework passes
 * a `Chain` object (not a real Command instance) as `inner` at runtime;
 * typing it as the full Command would allow clients to call methods that
 * do not exist on the Chain, compiling but crashing at runtime.
 *
 * @example
 * execute<T extends Rock>(subject: T, object: Ctx, inner: Runnable<T, Ctx, Res>): Res {
 *   return inner.run(subject, object);
 * }
 */
/**
 * Minimal continuation interface for middleware `execute` methods. Declare `inner` as
 * `Runnable<T, O, R>` (where T matches the `execute` subject parameter) rather than the full Command type.
 *
 * `run` is declared as a function property (not a shorthand method) — see
 * `Template.execute` for the bivariance-safety rationale that applies here as well.
 */
export type Runnable<SU, O, R> = { run: (subject: SU, object: O) => R };

type ReservedResolverNameError =
  "resolverName cannot be 'defaultResolver'. Fix: rename it to a unique non-reserved value";

type WidenedResolverNameError =
  "resolverName must be a literal. Fix: readonly resolverName = 'resolveFoo' as const";

/*
 * Extracts the `resolverName` string literal type from a Subject.
 *
 * Returns `never` for `any` (IsAny guard) and for non-literal `string`
 * resolverNames. When `never` is used as a mapped type key it produces `{}`,
 * so `Visit<C, S>` and `CommandSubjectStrategies<C>` collapse to `{}`
 * for Subjects with non-literal resolverNames — the resolver method requirement
 * for that Subject is dropped from `CommandSubjectStrategies`. `ValidResolverNames`
 * separately makes `run()` uncallable with a descriptive error.
 *
 * @example
 * class Dog extends Subject { readonly resolverName = "resolveDog" as const; }
 * type T = SubjectResolverName<Dog>;  // "resolveDog"
 *
 * class Bad extends Subject { readonly resolverName: string = "oops"; }
 * type T = SubjectResolverName<Bad>;  // never
 */
/** Extracts the `resolverName` string literal type from a Subject. Returns `never` for non-literal `resolverName` or `any`. */
export type SubjectResolverName<S> =
  // IsAny guard: when S is `any`, return `never` so mapped types keyed by SubjectResolverName<S>
  // produce {} rather than a spurious error-keyed method requirement.
  0 extends 1 & S
    ? never
    : S extends { resolverName: infer K extends string }
      ? string extends K
        ? never
        : K
      : never;

// All five slots explicit — the 5th (BDS) MUST be `any`, not omitted: BDS defaults to
// `[]`, which would make AnyCommand's BDS concrete and break it as a wildcard supertype.
type AnyCommand = Command<any, any, any, any, any>;
// All five slots explicit — the 5th (BDS) MUST be `any`, not omitted (defaults to `[]`).
type AnyMiddlewareCommand = MiddlewareCommand<any, any, any, any, any>;

/*
 * Structural fingerprint for all Command subtypes. Used as the pattern in phantom-based
 * extractor conditionals (CommandObject, CommandReturn, CommandBase, CommandResolvedSubjects,
 * CommandDefaultedSubjects) in place of the heritage-clause form
 * `C extends Command<infer B, infer O, infer R, infer BRS, infer BDS>`,
 * which triggers structural member inspection and causes circular type evaluation when a
 * subclass property's type depends on one of the extractors (TS2589).
 *
 * `[_commandBrand]` is a unique symbol brand that makes `CommandSignature` nominally typed:
 * only `Command` subclasses (which `implements CommandSignature`) satisfy it. External code
 * cannot forge the symbol key, so accidental structural matches on unrelated types are impossible.
 *
 * All five type parameters (B, O, R, BRS, BDS) are packed into the brand property's value
 * type. This is the carrier: a single symbol-keyed property that is invisible to IDE
 * autocomplete and does not pollute the Command interface with named fields.
 * Extractors match against `CommandSignature<any, infer O, any, any, any>` — TypeScript
 * expands this to the carrier shape and infers from the nested fields.
 *
 * `BRS` (base resolved subjects) and `BDS` (base defaulted subjects) form a typed partition
 * of the Command's subjects: `BRS` are handled by specific resolver methods, `BDS` by the
 * `defaultResolver`. The full subject union is `BRS[number] | BDS[number]`.
 *
 * `commandName` is intentionally NOT part of `CommandSignature`: it is a runtime identity
 * concern on `Command` (abstract property, implemented by subclasses). `CommandName<C>`
 * infers the literal directly from the `commandName` property on `C` — no carrier slot needed.
 *
 * The phantom field must not use the JSDoc internal marker in its comments: stripInternal
 * would strip it from the .d.ts, breaking cross-package consumers.
 */
declare const _commandBrand: unique symbol;
declare const _subjectBrand: unique symbol;

type CommandSignature<
  B = unknown,
  O = unknown,
  R = unknown,
  BRS extends any[] = any[],
  BDS extends any[] = any[],
> = {
  readonly [_commandBrand]: { b: B; o: O; r: R; brs: BRS; bds: BDS };
};

/*
 * Extracts the object type (`O`) from a Command's generic parameters.
 *
 * The object is the context/payload passed alongside the Subject when
 * running a Command. It is available to both the resolver method (for strategy
 * selection) and the Template's execute method (for execution).
 *
 * @example
 * class AccessCmd extends Command<Person, Building, Result, [Student]> { ... }
 * type T = CommandObject<AccessCmd>;  // Building
 */
/** Extracts the object type (`O`) from a Command — the context/payload passed to resolver methods and `execute`. Returns `never` if `C` does not extend `Command`. */
export type CommandObject<C> = C extends CommandSignature<any, infer O, any, any, any> ? O : never;

/*
 * Extracts the return type (`R`) from a Command's generic parameters.
 *
 * This is the type returned by both `command.run(...)` and `template.execute(...)`.
 * For async Commands, this is `Promise<T>`.
 *
 * @example
 * class AccessCmd extends Command<Person, Building, AccessResult, [Student]> { ... }
 * type T = CommandReturn<AccessCmd>;  // AccessResult
 */
/** Extracts the return type (`R`) from a Command — the result of `run()` and `execute()`. Returns `never` if `C` does not extend `Command`. */
export type CommandReturn<C> = C extends CommandSignature<any, any, infer R, any, any> ? R : never;

/** Extracts the base type (`B`) from a Command — the shared constraint all Subjects in the union extend. Returns `never` if `C` does not extend `Command`. */
export type CommandBase<C> = C extends CommandSignature<infer B, any, any, any, any> ? B : never;

/*
 * Extracts the `commandName` string literal type from a Command.
 *
 * Returns `never` if `C` does not have a `commandName` property at all,
 * or for `any` (IsAny guard). Returns `WidenedCommandNameError` for non-literal
 * `string` commandNames — a descriptive error key that surfaces at the hook
 * property declaration inside the Template's `implements` check, making the
 * miswiring visible rather than silently dropping the hook requirement.
 *
 * @example
 * class FeedCmd extends Command<...> { readonly commandName = "feed" as const; }
 * type T = CommandName<FeedCmd>;  // "feed"
 */
type WidenedCommandNameError =
  "commandName must be a literal. Fix: readonly commandName = 'myHook' as const";

/** Extracts the `commandName` string literal type from a Command. Returns a descriptive error string for non-literal `commandName`, `never` for absent `commandName` or `any`. */
export type CommandName<C> =
  // IsAny guard: when C is `any`, return `never` so mapped types keyed by CommandName<Cmd>
  // (e.g. CommandHooks<any[], SU>) produce {} rather than a spurious error-keyed property.
  0 extends 1 & C
    ? never
    : // Nominal gate: only Command subclasses carry [_commandBrand].
      // Checked first so non-Commands short-circuit before the commandName lookup.
      C extends { readonly [_commandBrand]: unknown }
      ? C extends { commandName: infer N extends string }
        ? string extends N
          ? WidenedCommandNameError
          : N
        : never
      : never;

// ─── Internal Type Utilities ─────────────────────────────────────

/*
 * Extracts the *resolved* Subject union from a Command — the subjects handled by
 * specific resolver methods (the `BRS` tuple).
 *
 * Given `Command<B, O, R, [Student, Professor], [Visitor]>`, produces `Student | Professor`.
 *
 * Returns `never` for `any` (IsAny guard) and if `C` does not extend `Command`.
 *
 * **Why `CommandSignature` and not `C extends Command<any, any, any, infer BRS, any>`:** the
 * heritage-clause pattern extracts the tuple via structural method-signature matching, which
 * creates a circular evaluation chain when `Template<C, any[], SU>` is involved:
 * `CommandSubjectUnion<C>` → structural match → `CommandSubjectStrategies` → `Visit`
 * → `Template` → `CommandSubjectUnion<C>`.
 * TypeScript detects the cycle and falls back to `any` for concrete subclasses.
 * `CommandSignature` breaks the cycle: it is a plain object type with no method signatures,
 * so TypeScript resolves it directly without recursing through the class hierarchy.
 * `any[]` (not `Subject[]`) avoids class-identity issues across package boundaries.
 */
/** Extracts the *resolved* Subject union from a Command — subjects handled by specific resolver methods. Returns `never` for `any` or non-Command types. */
export type CommandResolvedSubjects<C> =
  // IsAny guard: mirrors the guards on CommandName and SubjectResolverName.
  0 extends 1 & C
    ? never
    : C extends CommandSignature<any, any, any, infer BRS extends any[], any>
      ? BRS[number]
      : never;

/*
 * Extracts the *defaulted* Subject union from a Command — the subjects handled by
 * `defaultResolver` (the `BDS` tuple). Empty (`never`) for Commands with no defaulting.
 *
 * Given `Command<B, O, R, [Student, Professor], [Visitor]>`, produces `Visitor`.
 *
 * Returns `never` for `any` (IsAny guard) and if `C` does not extend `Command`.
 */
/** Extracts the *defaulted* Subject union from a Command — subjects routed to `defaultResolver`. `never` when the Command has no defaulting. */
export type CommandDefaultedSubjects<C> = 0 extends 1 & C
  ? never
  : C extends CommandSignature<any, any, any, any, infer BDS extends any[]>
    ? BDS[number]
    : never;

/*
 * The full Subject union of a Command — resolved subjects plus defaulted subjects.
 *
 * This is the complete set of Subjects the Command can dispatch to, the semantic
 * anchor used throughout the type machinery (`Template` default `SU`, `CommandHooks`
 * coverage, `Visit`, middleware coverage). It is the union of the two halves of the
 * resolution partition — deliberately a `|` of the two `[number]` projections rather
 * than a variadic tuple concat, which keeps evaluation cheap and avoids deferral.
 *
 * Returns `never` for `any` and non-Command types (both halves guard for `any`).
 */
/** The full Subject union of a Command — `CommandResolvedSubjects<C> | CommandDefaultedSubjects<C>`. Returns `never` for `any` or non-Command types. */
export type CommandSubjectUnion<C> = CommandResolvedSubjects<C> | CommandDefaultedSubjects<C>;

/*
 * Defines the signature of a single resolver method on a Command.
 *
 * For a given Command `C` and Subject `BS`, produces an object type with a
 * single method keyed by `SubjectResolverName<BS>`. The method receives the
 * Subject and a `Readonly` view of the object, and returns a Template.
 *
 * The object is `Readonly` in the resolver method signature to signal that
 * strategy selection should not mutate the object — mutation belongs in
 * `execute`. Hook validation occurs at the Template implementation site
 * (`implements Template<C, H, SU>`), not at the resolver method return boundary,
 * so resolver methods only need to return something with `execute`. Any Template
 * with concrete hooks satisfies the return type structurally.
 *
 * **Why `Template<C, any[], BS>` (not `Template<C, [], BS>`):**
 * Both resolve to the same structural shape — `{ execute<T extends BS>... }` —
 * because `CommandHooks<any[], BS> = {}` (the `CommandName` IsAny guard returns
 * `never` for `Cmd = any`, collapsing the mapped type to `{}`). Using `[]`
 * causes TypeScript to follow a recursive evaluation path through
 * `CommandSubjectStrategies` (TS2589). With `any[]`, TypeScript short-circuits
 * at `CommandName<any> = never` before reaching that path.
 *
 * @example
 * // For Command<Person, Building, Result, [Student, Professor]> and BS = Student:
 * // Visit<C, Student> = {
 * //   resolveStudent: (s: Student, o: Readonly<Building>) => Template<C, any[], Student>
 * // }
 */
type Visit<C extends AnyCommand, BS extends CommandSubjectUnion<C>> = {
  [K in SubjectResolverName<BS>]: (
    subject: BS,
    object: Readonly<CommandObject<C>>,
  ) => Template<C, any[], BS>;
};

/*
 * Converts a union type to an intersection type.
 *
 * Used by `ValidResolverNames` to merge per-element checks into a single
 * type. If any element produces an unsatisfiable error-keyed property, the
 * intersection carries it, making `run()` uncallable.
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/*
 * Computes the set of resolver methods a Command must implement, over a given
 * subject subset `REQ`.
 *
 * Iterates over `REQ`, remaps each Subject `SU` to its `resolverName` key via
 * `as SubjectResolverName<SU>`, and extracts the corresponding method signature
 * from `Visit<C, SU>`. The result is an object type with one method per Subject,
 * each correctly typed to its specific Subject (not the full union).
 *
 * `REQ` defaults to the full union (`CommandSubjectUnion<C>`) — the original
 * full-coverage behaviour. `Command.run()` passes `CommandResolvedSubjects<C>`
 * instead, so only the *resolved* half of the partition requires resolver
 * methods; the *defaulted* half is handled by `defaultResolver`.
 *
 * Duplicate `resolverName` values cause TypeScript to intersect the conflicting
 * method signatures for the shared key, making the method unimplementable.
 *
 * If the Command subclass is missing any required resolver method, the `this`
 * constraint on `run` is unsatisfied and `run` becomes uncallable at the call site.
 *
 * @example
 * // For Command<Person, Building, Result, [Student, Professor]> (REQ = Student | Professor):
 * // CommandSubjectStrategies<C> = {
 * //   resolveStudent: (s: Student, o: Readonly<Building>) => Template<...>;
 * //   resolveProfessor: (s: Professor, o: Readonly<Building>) => Template<...>;
 * // }
 */
type CommandSubjectStrategies<
  C extends AnyCommand,
  REQ extends CommandSubjectUnion<C> = CommandSubjectUnion<C>,
> = {
  [SU in REQ as SubjectResolverName<SU>]: Visit<C, SU>[SubjectResolverName<SU>];
};

/*
 * Structural execute-shape used by middleware coverage checks. Parameterized by `O`/`R`/`SU`
 * directly — NOT a `MiddlewareCommand` class `C`. Using a class `C` here would drag in class
 * invariance via the `_mwCache` field, making a concrete middleware's `MiddlewareTemplate`
 * incompatible with the host-roster form. The structural form normalizes that.
 * (ts-hack: "structural type at return sites".)
 */
type MwExec<O, R, SU> = {
  execute: <T extends SU>(subject: T, object: O, inner: Runnable<T, O, R>) => R;
};

/*
 * Per-subject middleware coverage for a single host Subject `S`: the middleware either declares
 * a resolver method (`resolveS`) returning a `MiddlewareTemplate`-shaped value, OR declares a
 * REQUIRED `defaultResolver` callable whose returned `execute` covers `S`. The `defaultResolver`
 * branch requires the property to be present (not optional) — a middleware only gets the default
 * escape when it actually declares one (mirrors the `CommandHooks` defaultResolver opt-out).
 * `defaultResolver`'s subject parameter is typed to the middleware's `BDS`, so it covers `S` only
 * when `S` was declared defaulted.
 */
type CoverOne<O, R, S extends Subject> =
  | { [K in SubjectResolverName<S>]: (subject: S, object: Readonly<O>) => MwExec<O, R, S> }
  | { readonly defaultResolver: (subject: S, object: Readonly<O>) => MwExec<O, R, S> };

/*
 * Intersects `CoverOne` over a tuple of host Subjects — the coverage requirement on a middleware
 * registered in a host with that roster. Recurses over the TUPLE, not the union: distributing
 * `CoverOne` over a union and folding with `UnionToIntersection` would flatten the per-subject
 * `(resolve | default)` unions and wrongly demand ALL branches. Tuple recursion preserves each
 * subject's independent OR.
 */
type CoverAll<O, R, Subjects extends Subject[]> = Subjects extends [
  infer Head extends Subject,
  ...infer Tail extends Subject[],
]
  ? CoverOne<O, R, Head> & CoverAll<O, R, Tail>
  : unknown;

/*
 * Enforces that every Subject in `BSL` declares a valid `resolverName`.
 *
 * Intersected into `run()`'s `this` parameter. It takes `BSL` directly from the
 * Command class's own generic (not a free type variable inside `run`), so it is
 * evaluated at each concrete call site with the specific tuple bound at subclass
 * definition time.
 *
 * Two validations are applied per element:
 * 1. Non-literal `resolverName` (wide `string`): produces `{ [WidenedResolverNameError]: never }`
 * 2. Reserved `resolverName = "defaultResolver"`: produces `{ [ReservedResolverNameError]: never }`
 *
 * Either result is an unsatisfiable structural requirement that makes `run` uncallable
 * with a descriptive property name explaining the issue.
 *
 * The IsAny guard (`0 extends 1 & BSL[K]`) prevents false positives when `BSL`
 * contains `any`.
 */
type ValidResolverNames<BSL extends unknown[]> = UnionToIntersection<
  {
    [K in keyof BSL]: 0 extends 1 & BSL[K]
      ? unknown
      : BSL[K] extends { resolverName: infer V extends string }
        ? string extends V
          ? { readonly [key in WidenedResolverNameError]: never }
          : V extends "defaultResolver"
            ? { readonly [key in ReservedResolverNameError]: never }
            : unknown
        : unknown;
  }[number]
>;

// ─── Core Classes ────────────────────────────────────────────────

/*
 * Abstract base class for all Subjects.
 *
 * A Subject is an entity that participates in double dispatch. Each Subject
 * subclass must declare a `resolverName` as a string literal, which serves as
 * the key for the corresponding resolver method on Commands.
 *
 * ## The `resolverName` Convention
 *
 * By convention, `resolverName` should be prefixed with `"resolve"`:
 * ```ts
 * readonly resolverName = "resolveStudent" as const;
 * ```
 *
 * The `resolverName` must be:
 * - A string literal type (not the wide `string` type) — enforced by
 *   `SubjectResolverName<S>` which returns `never` for non-literals, silently
 *   dropping the resolver method requirement from `CommandSubjectStrategies`.
 *   `ValidResolverNames` separately makes `run` uncallable with a
 *   descriptive error.
 * - Unique across all Subjects used within the same Command's subject union —
 *   duplicates cause `CommandSubjectStrategies` to intersect the conflicting
 *   method signatures, making the resolver method unimplementable.
 *
 * ## The `getCommandStrategy` Method
 *
 * This method performs the Subject's half of double dispatch. When
 * `command.run(subject, object)` is called, it delegates to
 * `subject.getCommandStrategy(command, object)`, which looks up
 * `command[this.resolverName]` and invokes it. If the specific resolver
 * method is absent (the Command assigns `defaultResolver` instead),
 * `defaultResolver` is called with `(this, object)` and its returned Template is used.
 *
 * Both the specific resolver call (`command[methodName](this, object)`) and the
 * `defaultResolver(this, object)` call preserve the `this` binding on the Command,
 * allowing resolver methods to access Command instance state via `this`.
 *
 * The `this` parameter constraint (`this & BS`) ensures the Subject
 * is part of the Command's subject union. This is automatically satisfied
 * during normal dispatch.
 *
 * `getCommandStrategy` is called by `Command._dispatch()` — not intended for
 * direct use by consumers.
 *
 * @example
 * class Student extends Subject {
 *   readonly resolverName = "resolveStudent" as const;
 *   constructor(
 *     public readonly name: string,
 *     public readonly department: string
 *   ) { super(); }
 * }
 */
/**
 * Abstract base class for Subjects. Declare `readonly resolverName` as a string literal
 * (e.g. `readonly resolverName = "resolveStudent" as const`) to participate in dispatch.
 */
export abstract class Subject {
  abstract readonly resolverName: string;
  // Nominal brand — makes Subject unforgeable; only Subject subclasses satisfy it.
  // Must NOT use the JSDoc internal marker — stripInternal would strip it from .d.ts,
  // defeating the structural incompatibility it enforces for dist consumers.
  declare readonly [_subjectBrand]: typeof _subjectBrand;

  /** @internal */
  getCommandStrategy<C extends AnyCommand, BS extends CommandSubjectUnion<C>>(
    this: this & BS,
    command:
      | Visit<C, this & BS>
      | {
          readonly defaultResolver: (
            subject: CommandSubjectUnion<C>,
            object: CommandObject<C>,
          ) => Template<C, any[], CommandSubjectUnion<C>>;
        },
    object: CommandObject<C>,
  ): Template<C, any[], this & BS> {
    const specificResolver = this.resolverName as SubjectResolverName<this & BS>;
    if (specificResolver in command) {
      return (command as Visit<C, this & BS>)[specificResolver](this, object);
    }
    if ("defaultResolver" in command) {
      return command.defaultResolver(this, object);
    }
    throw new Error(
      `No resolver for "${this.resolverName}" on command "${(command as AnyCommand).commandName ?? "(unknown)"}". ` +
        `Either implement a resolver method named "${this.resolverName}" or declare defaultResolver.`,
    );
  }
}

/*
 * Element type for `Command.middleware` arrays.
 *
 * Enforces two constraints on each middleware entry, given the host Command's resolved (`HBRS`)
 * and defaulted (`HBDS`) subject tuples:
 *
 * 1. **Per-subject coverage** — `CoverAll` over both host tuples requires, for every host
 *    Subject `S`, that the middleware either declares `resolveS` (returning a 3-arg execute) OR a
 *    `defaultResolver` whose execute covers `S`. This is the per-subject `(resolve | default)`
 *    partition — so a middleware that resolves some subjects and defaults others is accepted,
 *    while a middleware that omits a resolver for a subject its `defaultResolver` cannot cover is
 *    rejected. The host passes its two tuples directly — no `[...HBRS, ...HBDS]` concat.
 *
 * 2. **Callable shape** — exposes `_runChain` with a required continuation so
 *    `Command._runChain` can thread each step through the chain.
 *
 * Not exported — TypeScript inlines type aliases in `.d.ts`; TS4055 only fires
 * for unexported class/interface names.
 */
type MiddlewareElement<
  B,
  O,
  R,
  HBRS extends (B & Subject)[],
  HBDS extends (B & Subject)[],
> = CoverAll<O, R, HBRS> &
  CoverAll<O, R, HBDS> & {
    _runChain(
      subject: HBRS[number] | HBDS[number],
      object: O,
      continuation: Runnable<HBRS[number] | HBDS[number], O, R>,
    ): R;
  };

/*
 * Abstract base class for all Commands.
 *
 * A Command represents an operation that can be performed on a set of Subjects.
 * Subclasses must:
 *
 * 1. Declare `readonly commandName` as a string literal (used for hook keying).
 * 2. Implement one resolver method per *resolved* Subject (`BRS`, named after that
 *    Subject's `resolverName`, receiving the Subject and the object, and returning a
 *    Template to execute), and — when any Subject is *defaulted* (`BDS` non-empty) —
 *    declare `defaultResolver` as the catch-all for those defaulted Subjects.
 *
 * ## Generic Parameters
 *
 * - `B` — Base type. All Subjects in `BRS`/`BDS` must extend `B & Subject`.
 *         Allows constraining Subjects to share a common interface
 *         (e.g. `Person`, `Node`).
 * - `O` — Object type. The context/payload passed to both resolver methods
 *         and `execute`. Available during strategy selection and execution.
 * - `R` — Return type. The result of `execute` and `run`. Use `Promise<T>`
 *         for async Commands.
 * - `BRS` — Base Resolved Subjects. The ordered tuple of Subject types handled by
 *           specific resolver methods. Drives exhaustive resolver-method checking.
 * - `BDS` — Base Defaulted Subjects (default `[]`). The ordered tuple of Subject
 *           types intentionally routed to `defaultResolver`. `BRS` and `BDS` form a
 *           typed partition of the Command's subjects; the full union is
 *           `BRS[number] | BDS[number]`. With `BDS = []` the Command is fully
 *           exhaustive — every Subject must have a specific resolver method.
 *
 * ## The `run` Method
 *
 * `run` is the public entry point. Internally it delegates to `_runChain`,
 * which applies a unified two-phase procedure to every command in the chain:
 *
 * 1. **`_runChain`** — processes this command's own registered middleware
 *    (first element outermost), then calls `_dispatch` as the terminal step.
 *    Middleware commands are processed identically — their own registered
 *    middleware are applied recursively before their dispatch phase.
 *    Do not override in client subclasses — doing so bypasses the dispatch chain.
 *    `_runChain` is accessible to `MiddlewareElement` callers because
 *    `MiddlewareElement` declares it as part of its structural contract;
 *    `MiddlewareCommand` satisfies this by overriding without the `protected`
 *    modifier (widening is permitted in TypeScript).
 *
 * 2. **`_dispatch`** — calls `subject.getCommandStrategy(this, object)` to
 *    select the strategy, then calls `strategy.execute(subject, object)` for
 *    regular commands. `MiddlewareCommand` overrides `_dispatch` to cast the
 *    strategy to the 3-arg form and forward the continuation as `inner`.
 *    Do not override in client subclasses — doing so bypasses the dispatch chain.
 *
 * Because every step uses `_runChain` / `_dispatch`, middleware registered on
 * a middleware command are automatically applied.
 *
 * The `this` parameter constraint is an intersection enforcing the partition:
 * `this` must provide a specific resolver method for every *resolved* Subject
 * (`BRS`), and — when `BDS` is non-empty — a `defaultResolver` for the *defaulted*
 * Subjects. All `resolverName`s must be literals. Because the resolved and defaulted
 * halves are declared separately, a forgotten Subject is a compile error rather than
 * being silently absorbed by `defaultResolver`.
 *
 * `run` can be overridden by subclasses using `super.run(subject, object)`
 * to unconditionally wrap the chain entry point.
 *
 * ## Resolver Method Semantics
 *
 * Resolver methods are the **strategy selection** phase. They should:
 * - Inspect the Subject's state and the object to choose a strategy
 * - Return a Template instance (which may be a new instance, a singleton,
 *   a shared instance, etc. — client's choice)
 * - NOT mutate the Subject or object (the object parameter is `Readonly`)
 * - Use `this` freely to access Command state, configuration, or injected
 *   dependencies
 *
 * @example
 * class AccessCommand extends Command<Person, Building, AccessResult, [Student, Professor]> {
 *   readonly commandName = "access" as const;
 *
 *   resolveStudent(student: Student, building: Readonly<Building>) {
 *     if (student.department === building.department) return new DepartmentMatch();
 *     return new DenyAccess();
 *   }
 *
 *   resolveProfessor(professor: Professor, building: Readonly<Building>) {
 *     return new GrantAccess();
 *   }
 * }
 *
 * const result = accessCmd.run(student, building);
 */
/**
 * Abstract base class for Commands. Declare `readonly commandName` as a string literal
 * and implement one resolver method per Subject (named after that Subject's `resolverName`).
 * Call `run(subject, object)` to dispatch.
 */
export abstract class Command<
  B,
  O,
  R,
  BRS extends (B & Subject)[],
  BDS extends (B & Subject)[] = [],
> implements CommandSignature<B, O, R, BRS, BDS> {
  abstract readonly commandName: string;
  // Phantom carrier — no JS emit. Must NOT use the JSDoc internal marker —
  // stripInternal would strip it from .d.ts, breaking cross-package consumers.
  // Packs all five type parameters into the brand property's value type so that
  // extractors (CommandObject, CommandReturn, CommandBase, CommandResolvedSubjects,
  // CommandDefaultedSubjects, CommandSubjectUnion) can infer them via CommandSignature
  // without named phantom fields polluting the Command interface.
  declare readonly [_commandBrand]: { b: B; o: O; r: R; brs: BRS; bds: BDS };

  /**
   * Optional catch-all resolver for the *defaulted* subjects (`BDS`).
   *
   * `BDS` declares which subjects are intentionally default-resolved. When `BDS`
   * is non-empty, `run()` requires `defaultResolver` to be assigned. It is called
   * with the dispatched `(subject, object)` — exactly like a specific resolver
   * method — and returns the Template whose `execute` handles that subject, so the
   * single collective catch-all may branch among Strategy classes per call. Its
   * returned Template must accept any subject in `BDS[number]`. When `BDS` is empty
   * (the default), no `defaultResolver` is required or expected — every subject is
   * handled by a specific resolver method (full exhaustiveness).
   *
   * Specific resolver methods take precedence — `defaultResolver` is only invoked
   * when no matching resolver method is found for the dispatched subject's `resolverName`.
   *
   * **MiddlewareCommand note**: `MiddlewareCommand` narrows this to return a
   * `MiddlewareTemplate<MiddlewareCommand<B,O,R,BRS,BDS>, any[], BDS[number]>`, whose
   * `execute` accepts an `inner` continuation as a required third argument. The
   * implementation must call `inner.run(subject, object)` to forward control down the chain.
   */
  /*
   * MUST stay generic (`<T extends BDS[number]>`), NOT a fixed `(subject: BDS[number], …)` param.
   * A fixed param collapses to `never` for fully-resolved (BDS=[]) commands, and AnyCommand's `any`
   * param is not contravariantly assignable to `never` → every concrete command then fails
   * `extends AnyCommand` (TS2344 cascade). The generic constraint avoids it, exactly like
   * `Template.execute<T extends SU>`. See ts-hack MEMORY "defaultResolver is now a CALLABLE field".
   */
  declare readonly defaultResolver?: <T extends BDS[number]>(
    subject: T,
    object: O,
  ) => Template<Command<B, O, R, BRS, BDS>, any[], BDS[number]>;

  // Lazily populated by `_runChain` on the first dispatch. Caches the result of
  // `this.middleware` so that override getters returning array literals allocate
  // exactly once per instance rather than on every `run()` call.
  // Protected (not private) so that MiddlewareCommand._runChain can access it.
  // `MiddlewareElement` takes the host's two tuples directly and covers the full roster
  // per-subject — no `[...BRS, ...BDS]` concat needed.
  protected _mwCache?: MiddlewareElement<B, O, R, BRS, BDS>[];

  /**
   * Command-level middleware applied to every dispatch through this Command.
   * Each element must cover every Subject in this Command's full roster (resolved
   * plus defaulted) — declare its own subject list as a superset and implement the
   * required resolver methods.
   *
   * Each element acts as a **router**: its resolver methods select the `MiddlewareTemplate`
   * that executes for each dispatch. All per-dispatch state — timers, accumulators,
   * per-call context — belongs in those templates, not in the `MiddlewareCommand` itself.
   * `MiddlewareCommand` instances are stateless routers and are cached for the lifetime
   * of this command instance.
   *
   * Array ordering: the first element is outermost (starts first, finishes last).
   * To share middleware across all Commands in a domain, override this getter
   * in a shared base class and compose with `[...super.middleware, myMiddleware]`.
   *
   * The framework caches the result of this getter on the first dispatch and
   * reuses it for the lifetime of the instance. Middleware is therefore fixed
   * after the first `run()` call — mutations to the returned array or replacing
   * the getter's output after that point have no effect.
   *
   * Defaults to `[]`.
   */
  get middleware(): MiddlewareElement<B, O, R, BRS, BDS>[] {
    return [];
  }

  /** @internal */
  protected _runChain(
    subject: CommandSubjectUnion<Command<B, O, R, BRS, BDS>>,
    object: O,
    _continuation: never,
  ): R {
    const mw = this._mwCache ?? (this._mwCache = this.middleware);
    if (mw.length === 0) return this._dispatch(subject, object, undefined as never);
    type SU = CommandSubjectUnion<Command<B, O, R, BRS, BDS>>;
    return mw
      .reduceRight((next, m) => ({ run: (s: SU, o: O): R => m._runChain(s, o, next) }), {
        run: (s: SU, o: O): R => this._dispatch(s, o, undefined as never),
      })
      .run(subject, object);
  }

  /** @internal */
  protected _dispatch(
    subject: CommandSubjectUnion<Command<B, O, R, BRS, BDS>>,
    object: O,
    _continuation: never,
  ): R {
    // `subject` is the full union `BRS[number] | BDS[number]`; calling getCommandStrategy
    // on a union receiver distributes into per-arm strategy types whose `execute`
    // signatures don't unify. Collapse to a single full-union Template before calling
    // execute — sound because getCommandStrategy always returns the strategy matching the
    // actual runtime subject. (MiddlewareCommand._dispatch performs the analogous cast.)
    type SU = CommandSubjectUnion<Command<B, O, R, BRS, BDS>>;
    const strategy = subject.getCommandStrategy(this, object) as Template<
      Command<B, O, R, BRS, BDS>,
      any[],
      SU
    >;
    return strategy.execute(subject, object, undefined as never);
  }

  /**
   * Dispatches `subject` and `object` through the full middleware chain,
   * then selects and executes the matching strategy. Requires a specific resolver
   * method for every *resolved* subject (`BRS`), and — when any subject is
   * *defaulted* (`BDS` non-empty) — a `defaultResolver`. All `resolverName` values
   * must be string literals.
   */
  run<T extends CommandSubjectUnion<Command<B, O, R, BRS, BDS>>>(
    this: this &
      // Required resolvers: the RESOLVED half of the partition only.
      CommandSubjectStrategies<Command<B, O, R, BRS, BDS>, BRS[number]> &
      // defaultResolver required iff the DEFAULTED half is non-empty.
      // IsAny guard first: for AnyCommand (BDS = any) the `[BDS[number]] extends [never]`
      // check otherwise misfires and spuriously requires defaultResolver, breaking
      // `extends AnyCommand` for every concrete subclass.
      (0 extends 1 & BDS[number]
        ? unknown
        : [BDS[number]] extends [never]
          ? unknown
          : {
              readonly defaultResolver: (
                subject: BDS[number],
                object: O,
              ) => Template<Command<B, O, R, BRS, BDS>, any[], BDS[number]>;
            }) &
      ValidResolverNames<BRS> &
      ValidResolverNames<BDS>,
    subject: T,
    object: O,
  ): R {
    // Cast to the base class to access protected _runChain — safe because this is always
    // an instance of Command<B,O,R,BRS,BDS>. The cast is needed because the intersection
    // in the this constraint causes TypeScript to lose class-identity for protected access.
    return (this as Command<B, O, R, BRS, BDS>)._runChain(subject, object, undefined as never);
  }
}

/*
 * Maps a tuple of hook Commands to an object type keyed by their `commandName`,
 * enforcing that each hook Command has a resolver method for every Subject in `SU`.
 *
 * For each hook Command `Cmd` in `H`, the property type is the intersection
 * `Cmd & { [K in SU["resolverName"] & string]: any }`:
 * - If `Cmd` has all required resolver methods, the intersection is satisfiable
 *   and the implementing class can assign `new Cmd()` normally.
 * - If `Cmd` is missing any resolver method for a Subject in `SU`, the intersection
 *   is unsatisfiable — the `implements` check fails at the declaration site with
 *   a TS2416 error on the hook property.
 *
 * **Coverage check — intersection, not conditional (on `SU`):** A conditional type
 * `Cmd extends { [K in SU["resolverName"]]: any } ? Cmd : "Error"` is deferred
 * by TypeScript when `SU` is a free type parameter (as in abstract parameterized
 * templates). The intersection avoids deferral: `SU["resolverName"]` is an indexed
 * access type, which TypeScript evaluates using `SU`'s constraint — giving a
 * concrete key union even when `SU` is free.
 *
 * **`defaultResolver` opt-out:** A hook Command that declares `defaultResolver` as a
 * required property handles every Subject at runtime regardless of which resolver methods
 * are explicitly declared. For such Commands the intersection check is bypassed entirely
 * via a conditional on `Cmd` (not on `SU`). Because the extends-clause references only
 * `Cmd` — the mapped-type iteration variable, which is always concrete for a concrete `H`
 * tuple — this conditional is evaluated eagerly and does not defer even when `SU` is free.
 * Optional `defaultResolver?` (inherited from the base `Command` class without override)
 * does NOT satisfy `{ readonly defaultResolver: any }`, so Commands that do not explicitly
 * set it still require full resolver-method coverage.
 *
 * `H extends AnyCommand[]` is the constraint. `SU extends CommandSubjectUnion<H[number]>`
 * bounds `SU` to subjects covered by at least one hook Command — `H[number]` collapses
 * the hook tuple to a union before `CommandSubjectUnion` distributes over it.
 *
 * @example
 * // LogCommand handles [Cat, Dog, Bird] — has resolveCat, resolveDog, resolveBird
 * // CommandHooks<[LogCommand], Cat | Dog>:
 * //   LogCommand & { resolveCat: any; resolveDog: any } — satisfied → { log: LogCommand }
 *
 * // CatOnlyCommand handles [Cat] — has resolveCat only
 * // CommandHooks<[CatOnlyCommand], Cat | Dog>:
 * //   CatOnlyCommand & { resolveCat: any; resolveDog: any } — missing resolveDog → TS2416
 *
 * // LogCommand with `readonly defaultResolver = entry` — handles any Subject at runtime
 * // CommandHooks<[LogCommand], Student | Professor>:
 * //   LogCommand (no coverage check) — satisfied even without resolveStudent/resolveProfessor
 */
type CommandHooks<H extends AnyCommand[], SU extends CommandSubjectUnion<H[number]>> = {
  [Cmd in H[number] as CommandName<Cmd>]: Cmd extends { readonly defaultResolver: any }
    ? Cmd
    : Cmd & { [K in SU["resolverName"] & string]: any };
};

// ─── Template ────────────────────────────────────────────────────

/*
 * The strategy type. Defines the contract for executing a Command's
 * operation on a Subject.
 *
 * A Template combines:
 * - `execute(subject, object)` — the execution logic
 * - `CommandHooks<H, SU>` — structural properties referencing other Commands
 *   that `execute` may invoke, with subject coverage enforced at the `implements` site
 *
 * ## Generic Parameters
 *
 * - `C` — The Command this Template serves. Determines the object type,
 *         return type, and the full subject union.
 * - `H` — Hook tuple. A list of Command types that this Template's `execute`
 *         method may invoke during execution. Each hook Command appears as a
 *         structural property on the Template, keyed by its `commandName`.
 *         Defaults to `[]` (no hooks).
 *
 *         **Important:** `H` should be *provided* (concrete), not parameterized.
 *         A Template class declares its hook requirements in the `implements`
 *         clause:
 *         ```ts
 *         class MyTemplate implements Template<MyCmd, [AuditCmd, LogCmd]> { ... }
 *         ```
 *         The hooks are part of the Template's contract — they are not chosen
 *         by Strategies.
 *
 * - `SU` — Subject Union. The subset of `C`'s subject union that this Template
 *          handles. Defaults to the full union (`CommandSubjectUnion<C>`).
 *
 *          **This CAN be parameterized** on the Template class, allowing
 *          Strategies to narrow which Subjects they handle:
 *          ```ts
 *          abstract class AccessTemplate<SU extends CommandSubjectUnion<AccessCmd>>
 *            implements Template<AccessCmd, [AuditCmd], SU> { ... }
 *
 *          class GrantAccess extends AccessTemplate<Student> { ... }
 *          ```
 *          This does not break LSP — a `GrantAccess` is returned only for
 *          dispatches that route Students to it.
 *
 * ## Client Implementation Patterns
 *
 * Templates are typically implemented as abstract classes when Strategies are
 * needed, or as concrete classes when they serve as both Template and Strategy.
 *
 * **Abstract Template with Strategies:**
 * ```ts
 * abstract class AccessTemplate<SU extends CommandSubjectUnion<AccessCmd>>
 *   implements Template<AccessCmd, [AuditCmd], SU>
 * {
 *   // Hook — concrete (shared across Strategies)
 *   readonly audit = new AuditCommand();
 *
 *   // Or abstract — each Strategy provides its own
 *   // abstract readonly audit: AuditCommand;
 *
 *   execute(subject: SU, object: Building): AccessResult {
 *     this.audit.run(subject, { action: "access" });
 *     return this.doAccess(subject, object);
 *   }
 *   protected abstract doAccess(subject: SU, object: Building): AccessResult;
 * }
 *
 * class GrantAccess extends AccessTemplate<Student> {
 *   protected doAccess(s: Student, b: Building) { return { granted: true }; }
 * }
 * ```
 *
 * **Concrete Template (no Strategies):**
 * ```ts
 * class DenyAccess implements Template<AccessCmd> {
 *   execute(subject: CommandSubjectUnion<AccessCmd>, object: Building): AccessResult {
 *     return { granted: false, reason: "Access denied" };
 *   }
 * }
 * ```
 *
 * **Hook ownership rules:**
 * - Template declares which hooks are required (via `H` parameter)
 * - Hooks can be concrete on the Template (shared) or abstract (Strategy provides)
 * - Strategies may override concrete hooks from the Template
 * - Hooks can also be injected via constructor during strategy resolution
 *   in the Command's resolver method
 *
 * **Execute ownership:**
 * - `execute` can be implemented on the Template or left abstract for Strategies
 * - Strategies should exercise caution when overriding a Template's `execute`
 * - The recommended pattern is for the Template to implement `execute` and
 *   delegate to abstract/protected methods that Strategies implement
 *
 * ## Hook Enforcement
 *
 * `CommandHooks<H, SU>` is intersected into the Template type, enforcing two
 * things at the `implements` site:
 *
 * 1. **Presence** — a property must exist for each hook Command, keyed by its
 *    `commandName`. Missing a hook property is a compile error.
 *
 * 2. **Subject coverage** — each hook Command must declare resolver methods for
 *    every Subject in `SU`. The property type is `Cmd & { [K in SU["resolverName"] & string]: any }`;
 *    if `Cmd` is missing any required resolver method, the intersection is unsatisfiable
 *    and the `implements` check fails with TS2416 on the hook property. For example, a
 *    `LogCommand` that only handles `Cat` (declaring only `resolveCat`) cannot satisfy
 *    `Template<C, [LogCommand], Cat | Dog>` because it is missing `resolveDog`.
 *
 * ## Why `execute` (and all callable members) use function property syntax
 *
 * `execute: (...) => R` (function property) rather than `execute(...): R` (shorthand
 * method). TypeScript applies bivariant parameter checking to shorthand methods even under
 * `strictFunctionTypes`: an implementation can silently narrow `object` to a stricter type
 * than the interface declares, making it uncallable with valid inputs. Function property
 * syntax triggers strict (contravariant) checking — a narrower `object` is rejected at the
 * `implements` site with TS2416. The same pattern is applied to `MiddlewareTemplate`,
 * `Runnable`, and the internal default-resolver template types.
 */
/**
 * The strategy type. Combines an execution contract (`execute`) with structural hook
 * requirements (`CommandHooks<H, SU>`). Use in `implements` clauses on abstract Template
 * classes and concrete Strategy classes.
 *
 * ## Generic Parameters
 *
 * - `C` — The Command this Template serves. Determines `CommandObject<C>` (the object/payload
 *   type), `CommandReturn<C>` (the result type), and the full Subject union.
 * - `H` — Hook tuple (default `[]`). Commands whose `run` method `execute` may call during
 *   execution. Each appears as a structural property on the Template, keyed by `commandName`.
 *   Declare concrete hook types here — hooks are part of the Template's contract, not the
 *   Strategy's choice:
 *   ```ts
 *   class MyTemplate implements Template<MyCmd, [AuditCmd, LogCmd]> { ... }
 *   ```
 * - `SU` — Subject subset (default `CommandSubjectUnion<C>`). The subset of subjects this
 *   Template handles. Parameterize it on the Template class to let Strategies narrow:
 *   ```ts
 *   abstract class AccessTemplate<SU extends CommandSubjectUnion<AccessCmd>>
 *     implements Template<AccessCmd, [AuditCmd], SU> { ... }
 *
 *   class GrantAccess extends AccessTemplate<Student> { ... }
 *   ```
 *   This does not break LSP — a `GrantAccess` is returned only for dispatches that route
 *   Students to it.
 *
 * ## Hook Enforcement
 *
 * `CommandHooks<H, SU>` enforces two things at the `implements` site:
 * 1. **Presence** — a property must exist for each hook Command, keyed by its `commandName`.
 *    Missing one is a compile error.
 * 2. **Subject coverage** — each hook Command must cover every Subject in `SU`. A hook missing
 *    any required resolver method fails the `implements` check with TS2416 on that property.
 *
 * Hook properties can be concrete on the Template (shared across Strategies), abstract
 * (each Strategy provides its own), or injected via the Command's resolver method.
 *
 * ## Why `execute` uses function property syntax
 *
 * `execute: (...) => R` rather than `execute(...): R`. TypeScript applies bivariant parameter
 * checking to shorthand methods even under `strictFunctionTypes` — an implementation can
 * silently narrow `object` to a stricter type than declared, making it uncallable with valid
 * inputs. Function property syntax enforces strict (contravariant) checking, rejecting a
 * narrower `object` with TS2416 at the `implements` site.
 */
export type Template<
  C extends AnyCommand,
  H extends AnyCommand[] = [],
  SU extends CommandSubjectUnion<C> = CommandSubjectUnion<C>,
> = {
  execute: <T extends SU>(subject: T, object: CommandObject<C>, inner: never) => CommandReturn<C>;
} & CommandHooks<H, SU>;

/**
 * The Template type for `MiddlewareCommand` resolver methods. Use this as the
 * return type of resolver methods in a `MiddlewareCommand` subclass when you
 * want to declare the `inner` parameter in `execute`:
 *
 * ```ts
 * class TraceMiddleware extends MiddlewareCommand<object, Ctx, number, [Rock, Gem]> {
 *   readonly commandName = "trace" as const;
 *   // A single full-union template can serve both resolvers.
 *   readonly traceTemplate = {
 *     execute<T extends Rock | Gem>(subject: T, object: Ctx, inner: Runnable<T, Ctx, number>): number {
 *       console.log("before");
 *       const result = inner.run(subject, object);
 *       console.log("after");
 *       return result;
 *     },
 *   };
 *   resolveRock(r: Rock, ctx: Ctx): MiddlewareTemplate<TraceMiddleware, [], Rock> {
 *     return this.traceTemplate;
 *   }
 *   resolveGem(g: Gem, ctx: Ctx): MiddlewareTemplate<TraceMiddleware, [], Gem> {
 *     return this.traceTemplate;
 *   }
 * }
 * ```
 *
 * `inner` is the next command in the middleware chain — call `inner.run(subject, object)`
 * to invoke it, optionally enriching `object` first. `inner` is always defined when
 * invoked as part of a chain. Invoking a `MiddlewareCommand` directly via `run()` is a
 * compile error in well-typed TypeScript and throws at runtime when bypassed — always
 * register middleware via `Command.middleware`.
 *
 * **Note:** TypeScript's fewer-params rule means an `execute` that omits `inner` still
 * satisfies this type — the requirement is not enforced at the implementer's declaration
 * site, but `MiddlewareCommand._dispatch` always passes it.
 *
 * `execute` is declared as a function property — see `Template.execute` for the
 * bivariance-safety rationale.
 */
export type MiddlewareTemplate<
  C extends AnyMiddlewareCommand,
  H extends AnyCommand[] = [],
  SU extends CommandSubjectUnion<C> = CommandSubjectUnion<C>,
> = Omit<Template<C, H, SU>, "execute"> & {
  execute: <T extends SU>(
    subject: T,
    object: CommandObject<C>,
    inner: Runnable<T, CommandObject<C>, CommandReturn<C>>,
  ) => CommandReturn<C>;
};

/*
 * Abstract base class for middleware Commands.
 *
 * A MiddlewareCommand is a Command that intercepts dispatch. It extends
 * `Command` and follows the same resolver method + Template pattern — each
 * resolver method returns a `MiddlewareTemplate` whose `execute` accepts an
 * `inner` continuation representing the next step in the chain.
 * Calling `inner.run(subject, object)` invokes the continuation:
 *
 * ```ts
 * class LogMiddleware extends MiddlewareCommand<Person, Building, Result, [Student, Professor]> {
 *   readonly commandName = "log" as const;
 *   resolveStudent(s: Student, b: Readonly<Building>) { return new LogTemplate(); }
 *   resolveProfessor(p: Professor, b: Readonly<Building>) { return new LogTemplate(); }
 * }
 *
 * class LogTemplate implements MiddlewareTemplate<LogMiddleware, [], Student | Professor> {
 *   execute(
 *     subject: Student | Professor,
 *     object: Building,
 *     inner: Runnable<Student | Professor, Building, Result>,
 *   ): Result {
 *     console.log("before", subject);
 *     const result = inner.run(subject, object);
 *     console.log("after", result);
 *     return result;
 *   }
 * }
 * ```
 *
 * ## Registration
 *
 * Override `Command.middleware` to return a list of `MiddlewareCommand` instances.
 * The middleware wraps every dispatch through the Command — resolver method selection
 * and execute — for all Subjects.
 *
 * ## Ordering
 *
 * The first middleware in the array is outermost — starts first, finishes last.
 * `[auth, log, trace]` means `auth` wraps everything: auth → log → trace → dispatch.
 *
 * ## Object enrichment
 *
 * Middleware can forward a modified object to the continuation:
 * ```ts
 * execute(subject, object, inner) {
 *   return inner.run(subject, { ...object, timestamp: Date.now() });
 * }
 * ```
 * The subject is fixed across the chain — dispatch routes on subject type,
 * so passing a different subject to `inner.run()` would re-route to that
 * subject's resolver in the next chain step, which is rarely intended. Only
 * the object should be enriched.
 *
 * For the spread to typecheck, `O` must declare the enrichment slot as
 * optional:
 * ```ts
 * type Ctx = { factor: number; timestamp?: number };
 * //                          ^^^^^^^^^^
 * ```
 * Strategies that do not use the slot simply ignore it. Enrichment fields
 * belong in `O` — they are part of the command's contextual contract.
 *
 * **Limitation — enrichment is not type-checked end-to-end.** The framework
 * uses a single `O` type throughout the chain: `run`, middleware `execute`,
 * and strategy `execute` all see the same `O`. TypeScript has no way to
 * express that middleware has narrowed `O` to `O & { slot: T }` by the time
 * the strategy runs. Strategies that rely on middleware-supplied fields must
 * cast (`object as O & { slot: T }`) — this documents the runtime contract
 * but is not enforced at the call site. A framework-level fix would require
 * splitting `O` into separate input (`O_in`) and enriched (`O_out`) type
 * parameters, which is a deeper design change.
 *
 * ## Standalone invocation
 *
 * Invoking a `MiddlewareCommand` directly via `run()` is a **compile error**:
 * `MiddlewareCommand.run()` is declared with `this: never`, making it uncallable
 * on any instance from well-typed TypeScript. If bypassed (JavaScript, `any`-typed
 * code), a runtime error is also thrown. Always register middleware via
 * `Command.middleware`.
 *
 * ## Internal methods
 *
 * **`_runChain`** — Intentionally public (no `protected` modifier on `override`) —
 * required so that `Command._runChain` can call `m._runChain(s, o, next)` where `m`
 * is typed as `MiddlewareElement<...>`. Widening `protected` to public in an override
 * is permitted in TypeScript. `continuation` mirrors the `Template.execute` / `never`
 * pattern: the base `Command._runChain` declares `continuation: never` (callers pass
 * `undefined as never`); the override declares `continuation: Runnable` (required,
 * no `?`). Bivariance on class methods permits this override (`never extends Runnable`).
 *
 * **`_dispatch`** — The cast from `Template<C, any[], SU>` (3-arg execute with `inner: never`) to
 * `MiddlewareTemplate<MiddlewareCommand<B, O, R, BRS, BDS>, any[], SU>` (3-arg execute with `inner: Runnable`) is
 * required because `getCommandStrategy` returns the base-template form. This is safe because
 * `MiddlewareElement`'s per-subject coverage (enforced at `Command.middleware` assignment)
 * guarantees any registered middleware's resolvers/`defaultResolver` return `MiddlewareTemplate`-compatible values.
 * Do not call directly — only safe when called from `_runChain`, which always passes
 * a valid `Runnable` continuation.
 */
/**
 * Abstract base class for middleware Commands. Extend this to define
 * interceptors that wrap dispatch with pre/post logic or object enrichment.
 *
 * A `MiddlewareCommand` is a **router**: its resolver methods select the `MiddlewareTemplate`
 * that executes for each dispatch. Keep `MiddlewareCommand` subclasses stateless — all
 * execution logic and per-dispatch state belong in those templates.
 *
 * The type parameters mirror `Command` exactly — a `MiddlewareCommand` is a `Command` whose
 * resolvers return `MiddlewareTemplate`s. Its subjects partition into resolved (`BRS`) and
 * defaulted (`BDS`) just like any Command. A middleware's full roster (`BRS ∪ BDS`) must be a
 * superset of any Command's roster you register it in: the compiler checks, per host Subject,
 * that the middleware either resolves it or covers it with `defaultResolver`. If a host's roster
 * is `[Student, Professor]` and the middleware handles only `[Student]`, the registration is
 * rejected.
 */
export abstract class MiddlewareCommand<
  B,
  O,
  R,
  BRS extends (B & Subject)[],
  BDS extends (B & Subject)[] = [],
> extends Command<B, O, R, BRS, BDS> {
  /**
   * Narrows `Command.defaultResolver?` to return a `MiddlewareTemplate`, surfacing the `inner`
   * continuation as a required third argument in the `execute` signature, and typed to the
   * middleware's defaulted subjects (`BDS`). Called with the dispatched `(subject, object)`;
   * `inner` is always defined when dispatched via the middleware chain.
   *
   * The implementation must call `inner.run(subject, object)` to forward control down
   * the chain. The signature makes this requirement explicit; TypeScript cannot enforce it.
   */
  /* Same generic-or-`extends AnyCommand`-breaks rule as `Command.defaultResolver` above. */
  declare readonly defaultResolver?: <T extends BDS[number]>(
    subject: T,
    object: O,
  ) => MiddlewareTemplate<MiddlewareCommand<B, O, R, BRS, BDS>, any[], BDS[number]>;

  /** @internal */
  override run(
    this: never,
    subject: CommandSubjectUnion<MiddlewareCommand<B, O, R, BRS, BDS>>,
    object: O,
  ): R {
    // Body is unreachable in well-typed TypeScript (this: never).
    // Defense-in-depth for JavaScript callers or any-typed bypasses.
    const self = this as unknown as MiddlewareCommand<B, O, R, BRS, BDS>;
    throw new Error(
      `MiddlewareCommand "${self.commandName}" cannot be invoked directly. ` +
        `Register it in a Command's middleware array instead.`,
    );
  }

  /** Runs this middleware command's own registered middleware chain, then delegates to `_dispatch` with the continuation. Called exclusively by `Command._runChain`. */
  override _runChain(
    subject: CommandSubjectUnion<MiddlewareCommand<B, O, R, BRS, BDS>>,
    object: O,
    continuation: Runnable<CommandSubjectUnion<MiddlewareCommand<B, O, R, BRS, BDS>>, O, R>,
  ): R {
    const mw = this._mwCache ?? (this._mwCache = this.middleware);
    if (mw.length === 0) return this._dispatch(subject, object, continuation);
    type SU = CommandSubjectUnion<MiddlewareCommand<B, O, R, BRS, BDS>>;
    return mw
      .reduceRight((next, m) => ({ run: (s: SU, o: O): R => m._runChain(s, o, next) }), {
        run: (s: SU, o: O): R => this._dispatch(s, o, continuation),
      })
      .run(subject, object);
  }

  /** @internal */
  protected override _dispatch(
    subject: CommandSubjectUnion<MiddlewareCommand<B, O, R, BRS, BDS>>,
    object: O,
    continuation: Runnable<CommandSubjectUnion<MiddlewareCommand<B, O, R, BRS, BDS>>, O, R>,
  ): R {
    type SU = CommandSubjectUnion<MiddlewareCommand<B, O, R, BRS, BDS>>;
    const strategy = subject.getCommandStrategy(this, object) as MiddlewareTemplate<
      MiddlewareCommand<B, O, R, BRS, BDS>,
      any[],
      SU
    >;
    return strategy.execute(subject, object, continuation);
  }
}
