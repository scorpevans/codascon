/*
 * codascon — code as config
 *
 * A structural protocol for code organization with exhaustive compile-time type checking.
 *
 * ## Core Concepts
 *
 * **Subject** — An entity that participates in double dispatch. Each Subject
 * declares a unique `visitName` string literal (e.g. `"resolveStudent"`) which
 * the framework uses to route dispatch to the correct visit method on a Command.
 * Subjects extend the abstract `Subject` base class.
 *
 * **Command** — An operation that can be performed on Subjects. A Command
 * declares visit methods — one per Subject in its subject union — each named
 * after that Subject's `visitName`. The visit method receives the Subject and
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
 * ## Dispatch Flow
 *
 * ```
 * command.run(subject, object)
 *   → subject.getCommandStrategy(command, object)     // Subject initiates double dispatch
 *     → command[subject.visitName](subject, object)   // Command's visit method selects strategy
 *       → returns a Template instance                 // The chosen strategy
 *   → template.execute(subject, object)               // Strategy executes
 *   → returns R                                       // Result
 * ```
 *
 * ## Type Safety Guarantees
 *
 * - **Exhaustive visit methods**: A Command's `run` method has a `this` parameter
 *   constrained by `CommandSubjectStrategies<C>`, which maps each Subject's
 *   `visitName` to its required visit method signature. If any visit method is
 *   missing, `run` becomes uncallable at the call site.
 *
 * - **Subject union enforcement**: `run` only accepts Subjects that are in the
 *   Command's declared subject union (`BSL`). Passing an unsupported Subject is
 *   a compile error.
 *
 * - **Literal visitName**: `SubjectVisitName<S>` returns `never` for non-literal
 *   `string` visitNames. When `never` is a mapped type key the entry is dropped,
 *   so visit method requirements for Subjects with non-literal visitNames are
 *   omitted from `CommandSubjectStrategies` — and `RequireLiteralVisitNames`
 *   makes `run` uncallable with a descriptive error property name.
 *
 * - **Duplicate visitName detection**: If two Subjects in the same Command's
 *   union share a `visitName`, `CommandSubjectStrategies` produces two entries
 *   with the same key; TypeScript intersects them into an impossible method
 *   signature (e.g. `(s: Dog) => ... & (s: Cat) => ...`), making the visit
 *   method unimplementable.
 *
 * - **Hook presence and subject coverage**: `CommandHooks<H, SU>` requires the
 *   Template to have a property for each hook Command, keyed by `commandName`,
 *   AND enforces that each hook Command declares visit methods for every Subject
 *   in `SU`. A hook missing any required visit method resolves to an error string
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
 * - Injected via constructor during strategy resolution in the Command's visit method
 *
 * **SU parameterization:**
 * A Template can parameterize its SU (`T<SU extends ...>`), allowing Strategies
 * to narrow which Subjects they handle. This does not break LSP — a
 * `GrantAccess extends AccessTemplate<Student>` is a valid strategy for any
 * dispatch that routes Students to it.
 *
 * **Async support:**
 * Set `R = Promise<Result>` on the Command. Visit methods (strategy selection)
 * remain synchronous; only `execute` returns the Promise.
 */

// ─── Type Utilities (exported) ───────────────────────────────────

/*
 * Extracts the `visitName` string literal type from a Subject.
 *
 * Returns `never` for `any` (IsAny guard) and for non-literal `string`
 * visitNames. When `never` is used as a mapped type key it produces `{}`,
 * so `Visit<C, S>` and `CommandSubjectStrategies<C>` collapse to `{}`
 * for Subjects with non-literal visitNames — the visit method requirement
 * for that Subject is silently dropped at the type level.
 *
 * @example
 * class Dog extends Subject { readonly visitName = "resolveDog" as const; }
 * type T = SubjectVisitName<Dog>;  // "resolveDog"
 *
 * class Bad extends Subject { readonly visitName: string = "oops"; }
 * type T = SubjectVisitName<Bad>;  // never
 */
type WidenedVisitNameError =
  "visitName must be a literal. Fix: readonly visitName = 'resolveFoo' as const";

/** Extracts the `visitName` string literal type from a Subject. Returns `never` for non-literal `visitName` or `any`. */
export type SubjectVisitName<S> =
  // IsAny guard: when S is `any`, return `never` so mapped types keyed by SubjectVisitName<S>
  // produce {} rather than a spurious error-keyed method requirement.
  0 extends 1 & S
    ? never
    : S extends { visitName: infer K extends string }
      ? string extends K
        ? never
        : K
      : never;

type AnyCommand = Command<any, any, any, any>;

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

/** Extracts the `commandName` string literal type from a Command. Returns `WidenedCommandNameError` for non-literal `commandName`, `never` for absent `commandName` or `any`. */
export type CommandName<C> =
  // IsAny guard: when C is `any`, return `never` so mapped types keyed by CommandName<Cmd>
  // (e.g. CommandHooks<any[], SU>) produce {} rather than a spurious error-keyed property.
  0 extends 1 & C
    ? never
    : C extends { commandName: infer K extends string }
      ? string extends K
        ? WidenedCommandNameError
        : K
      : never;

/*
 * Extracts the object type (`O`) from a Command's generic parameters.
 *
 * The object is the context/payload passed alongside the Subject when
 * running a Command. It is available to both the visit method (for strategy
 * selection) and the Template's execute method (for execution).
 *
 * @example
 * class AccessCmd extends Command<Person, Building, Result, [Student]> { ... }
 * type T = CommandObject<AccessCmd>;  // Building
 */
/** Extracts the object type (`O`) from a Command — the context/payload passed to visit methods and `execute`. Returns `never` if `C` does not extend `Command`. */
export type CommandObject<C> = C extends Command<any, infer O, any, any> ? O : never;

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
export type CommandReturn<C> = C extends Command<any, any, infer R, any> ? R : never;

// ─── Internal Type Utilities ─────────────────────────────────────

/*
 * Extracts the Subject union from a Command's `BSL` tuple parameter.
 *
 * Given `Command<B, O, R, [Student, Professor]>`, produces `Student | Professor`.
 * This is the set of Subjects the Command can dispatch to.
 *
 * Returns `never` for `any` (IsAny guard), mirroring `CommandName` and `SubjectVisitName`.
 * Returns `never` if `C` does not extend `Command`.
 *
 * **Why `_bsl` and not `C extends Command<any, any, any, infer BSL>`:** The heritage-clause
 * pattern extracts `BSL` via structural method-signature matching, which creates a circular
 * evaluation chain when `Template<C, any[], SU>` is involved:
 * `CommandSubjectUnion<C>` → structural match → `CommandSubjectStrategies` → `Visit`
 * → `Template` → `CommandSubjectUnion<C>`.
 * TypeScript detects the cycle and falls back to `any` for concrete subclasses.
 * The phantom `declare readonly _bsl: BSL` property on `Command` breaks the cycle by
 * providing a direct property-access path to `BSL` that bypasses method-signature traversal.
 */
/** Extracts the Subject union from a Command — the set of Subjects the Command can dispatch to. Returns `never` for `any` or non-Command types. */
export type CommandSubjectUnion<C> =
  // IsAny guard: mirrors the guards on CommandName and SubjectVisitName.
  0 extends 1 & C
    ? never
    : // Reads the phantom `_bsl` property rather than pattern-matching on `Command<...infer BSL>`.
      // Heritage-clause extraction triggers circular evaluation through CommandSubjectStrategies
      // → Visit → Template → CommandSubjectUnion. Property access breaks the cycle.
      // `any[]` (not `Subject[]`) avoids class-identity issues across package boundaries.
      C extends { _bsl: infer BSL extends any[] }
      ? BSL[number]
      : never;

/*
 * Defines the signature of a single visit method on a Command.
 *
 * For a given Command `C` and Subject `BS`, produces an object type with a
 * single method keyed by `SubjectVisitName<BS>`. The method receives the
 * Subject and a `Readonly` view of the object, and returns a Template.
 *
 * The object is `Readonly` in the visit method signature to signal that
 * strategy selection should not mutate the object — mutation belongs in
 * `execute`. Hook validation occurs at the Template implementation site
 * (`implements Template<C, H, SU>`), not at the visit-method return boundary,
 * so visit methods only need to return something with `execute`. Any Template
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
  [K in SubjectVisitName<BS>]: (
    subject: BS,
    object: Readonly<CommandObject<C>>,
  ) => Template<C, any[], BS>;
};

/*
 * Converts a union type to an intersection type.
 *
 * Used by `RequireLiteralVisitNames` to merge per-element checks into a single
 * type. If any element produces `{ [WidenedVisitNameError]: never }`, the
 * intersection carries that property, making `run()` uncallable.
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/*
 * Computes the full set of visit methods a Command must implement.
 *
 * Iterates over `CommandSubjectUnion<C>` (the union of all Subjects in the
 * Command's BSL tuple), remaps each Subject `SU` to its `visitName` key via
 * `as SubjectVisitName<SU>`, and extracts the corresponding method signature
 * from `Visit<C, SU>`. The result is an object type with one method per Subject,
 * each correctly typed to its specific Subject (not the full union).
 *
 * Duplicate `visitName` values cause TypeScript to intersect the conflicting
 * method signatures for the shared key, making the method unimplementable.
 *
 * This type is used as a `this` parameter constraint on `Command.run()`.
 * If the Command subclass is missing any visit method, the `this` constraint
 * is unsatisfied and `run` becomes uncallable at the call site.
 *
 * @example
 * // For Command<Person, Building, Result, [Student, Professor]>:
 * // CommandSubjectStrategies<C> = {
 * //   resolveStudent: (s: Student, o: Readonly<Building>) => Template<...>;
 * //   resolveProfessor: (s: Professor, o: Readonly<Building>) => Template<...>;
 * // }
 */
type CommandSubjectStrategies<C extends AnyCommand> = {
  [SU in CommandSubjectUnion<C> as SubjectVisitName<SU>]: Visit<C, SU>[SubjectVisitName<SU>];
};

/*
 * Enforces that every Subject in `BSL` declares a literal `visitName`.
 *
 * Intersected into `run()`'s `this` parameter. It takes `BSL` directly from the
 * Command class's own generic (not a free type variable inside `run`), so it is
 * evaluated at each concrete call site with the specific tuple bound at subclass
 * definition time.
 *
 * If any element of `BSL` has a non-literal `visitName` (i.e. typed as the wide
 * `string`), the result includes `{ [WidenedVisitNameError]: never }` — an
 * unsatisfiable structural requirement that makes `run` uncallable with a
 * descriptive property name explaining the issue.
 *
 * The IsAny guard (`0 extends 1 & BSL[K]`) prevents false positives when `BSL`
 * contains `any`.
 */
type RequireLiteralVisitNames<BSL extends unknown[]> = UnionToIntersection<
  {
    [K in keyof BSL]: 0 extends 1 & BSL[K]
      ? unknown
      : BSL[K] extends { visitName: infer V extends string }
        ? string extends V
          ? { readonly [key in WidenedVisitNameError]: never }
          : unknown
        : unknown;
  }[number]
>;

// ─── Core Classes ────────────────────────────────────────────────

/*
 * Abstract base class for all Subjects.
 *
 * A Subject is an entity that participates in double dispatch. Each Subject
 * subclass must declare a `visitName` as a string literal, which serves as
 * the key for the corresponding visit method on Commands.
 *
 * ## The `visitName` Convention
 *
 * By convention, `visitName` should be prefixed with `"resolve"`:
 * ```ts
 * readonly visitName = "resolveStudent" as const;
 * ```
 *
 * The `visitName` must be:
 * - A string literal type (not the wide `string` type) — enforced by
 *   `SubjectVisitName<S>` which returns `never` for non-literals, silently
 *   dropping the visit method requirement from `CommandSubjectStrategies`.
 *   `RequireLiteralVisitNames` separately makes `run` uncallable with a
 *   descriptive error.
 * - Unique across all Subjects used within the same Command's subject union —
 *   duplicates cause `CommandSubjectStrategies` to intersect the conflicting
 *   method signatures, making the visit method unimplementable.
 *
 * ## The `getCommandStrategy` Method
 *
 * This method performs the Subject's half of double dispatch. When
 * `command.run(subject, object)` is called, it delegates to
 * `subject.getCommandStrategy(command, object)`, which looks up
 * `command[this.visitName]` and invokes it with `(this, object)`.
 *
 * The method call `command[methodName](this, object)` preserves `this`
 * binding on the Command, allowing visit methods to access Command
 * instance state via `this`.
 *
 * The `this` parameter constraint (`this & BS`) ensures the Subject
 * is part of the Command's subject union. This is automatically satisfied
 * during normal dispatch.
 *
 * @example
 * class Student extends Subject {
 *   readonly visitName = "resolveStudent" as const;
 *   constructor(
 *     public readonly name: string,
 *     public readonly department: string
 *   ) { super(); }
 * }
 */
/**
 * Abstract base class for Subjects. Declare `readonly visitName` as a string literal
 * (e.g. `readonly visitName = "resolveStudent" as const`) to participate in dispatch.
 */
export abstract class Subject {
  abstract readonly visitName: string;

  /**
   * Performs the Subject's half of double dispatch. Called by `Command.run()` —
   * not intended for direct use by consumers.
   * @internal
   */
  getCommandStrategy<C extends AnyCommand, BS extends CommandSubjectUnion<C>>(
    this: this & BS,
    command: Visit<C, this & BS>,
    object: CommandObject<C>,
  ): Template<C, any[], this & BS> {
    const methodName = this.visitName as SubjectVisitName<this & BS>;
    return command[methodName](this, object);
  }
}

/*
 * Abstract base class for all Commands.
 *
 * A Command represents an operation that can be performed on a set of Subjects.
 * Subclasses must:
 *
 * 1. Declare `readonly commandName` as a string literal (used for hook keying).
 * 2. Implement one visit method per Subject in `BSL`, named after that Subject's
 *    `visitName`. Each visit method receives the Subject and the object, and
 *    returns a Template (strategy) to execute.
 *
 * ## Generic Parameters
 *
 * - `B` — Base type. All Subjects in `BSL` must extend `B & Subject`.
 *         Allows constraining Subjects to share a common interface
 *         (e.g. `Person`, `Node`).
 * - `O` — Object type. The context/payload passed to both visit methods
 *         and `execute`. Available during strategy selection and execution.
 * - `R` — Return type. The result of `execute` and `run`. Use `Promise<T>`
 *         for async Commands.
 * - `BSL` — Subject tuple. The ordered list of Subject types this Command
 *           dispatches to. Each element must extend `B & Subject`. The tuple
 *           drives exhaustive visit method checking.
 *
 * ## The `run` Method
 *
 * `run` orchestrates the full dispatch cycle:
 * 1. Calls `subject.getCommandStrategy(this, object)` — Subject initiates
 *    double dispatch by calling `this[subject.visitName](subject, object)`
 *    on the Command.
 * 2. The visit method inspects the Subject and object, selects and returns
 *    a Template (strategy).
 * 3. `run` calls `template.execute(subject, object)` and returns the result.
 *
 * The `this` parameter constraint
 * (`this & CommandSubjectStrategies<Command<B, O, R, BSL>> & RequireLiteralVisitNames<BSL>`)
 * ensures all visit methods are present and all `visitName`s are literals.
 * The error surfaces at the call site when any visit method is missing or a
 * `visitName` is non-literal — `run` becomes uncallable.
 *
 * `run` can be overridden by subclasses (e.g. for auditing, logging,
 * pre/post-processing) using `super.run(subject, object)`.
 *
 * ## Visit Method Semantics
 *
 * Visit methods are the **strategy selection** phase. They should:
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
 * and implement one visit method per Subject (named after that Subject's `visitName`).
 * Call `run(subject, object)` to dispatch.
 */
export abstract class Command<B, O, R, BSL extends (B & Subject)[]> {
  abstract readonly commandName: string;
  // Phantom property — no JS emit. Enables non-circular BSL extraction in `CommandSubjectUnion`.
  // Must NOT use the JSDoc internal marker — stripInternal would strip it from .d.ts, breaking cross-package consumers.
  declare readonly _bsl: BSL;

  run<T extends CommandSubjectUnion<Command<B, O, R, BSL>>>(
    this: this & CommandSubjectStrategies<Command<B, O, R, BSL>> & RequireLiteralVisitNames<BSL>,
    subject: T,
    object: O,
  ): R {
    const strategy = subject.getCommandStrategy(this, object);
    return strategy.execute(subject, object);
  }
}

/*
 * Maps a tuple of hook Commands to an object type keyed by their `commandName`,
 * enforcing that each hook Command has a visit method for every Subject in `SU`.
 *
 * For each hook Command `Cmd` in `H`:
 * - If `Cmd` declares a visit method for every Subject in `SU`
 *   (i.e. has a property matching each `SubjectVisitName<SU>` key),
 *   the property resolves to `Cmd` — the implementing class satisfies it normally.
 * - If the hook is missing any visit method required by `SU`, the property
 *   resolves to an error string — no value of type `Cmd` can satisfy a string
 *   literal type, so the `implements` check fails at the declaration site.
 *
 * `H extends AnyCommand[]` is the constraint. The hook coverage check uses a
 * structural pattern (`Cmd extends { [K in SubjectVisitName<SU>]: any }`) rather
 * than `CommandSubjectUnion<Cmd>`, so the constraint does not need to be `unknown[]`.
 *
 * @example
 * // LogCommand handles [Cat, Dog, Bird] — has resolveCat, resolveDog, resolveBird
 * // CommandHooks<[LogCommand], Cat | Dog>:
 * //   LogCommand extends { resolveCat: any, resolveDog: any } → true → { log: LogCommand }
 *
 * // CatOnlyCommand handles [Cat] — has resolveCat only
 * // CommandHooks<[CatOnlyCommand], Cat | Dog>:
 * //   CatOnlyCommand extends { resolveCat: any, resolveDog: any } → false → { catOnly: "Error: ..." }
 */
type CommandHooks<H extends AnyCommand[], SU extends Subject> = {
  [Cmd in H[number] as CommandName<Cmd>]: Cmd extends {
    [K in SubjectVisitName<SU>]: any;
  }
    ? Cmd
    : "Error: hook Command does not declare visit methods for all subjects in SU";
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
 *   in the Command's visit method
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
 * 2. **Subject coverage** — each hook Command must declare visit methods for
 *    every Subject in `SU` (checked via `SubjectVisitName<SU>` key presence).
 *    If a hook is missing any required visit method, its property type resolves
 *    to an error string, making the `implements` check fail. For example, a
 *    `LogCommand` that only handles `Cat` (declaring only `resolveCat`) cannot
 *    satisfy `Template<C, [LogCommand], Cat | Dog>` because it is missing
 *    `resolveDog`.
 */
/**
 * Strategy interface. Implement `execute(subject, object)` and declare a property
 * for each hook Command in `H` (keyed by `commandName`).
 */
export type Template<
  C extends AnyCommand,
  H extends AnyCommand[] = [],
  SU extends CommandSubjectUnion<C> = CommandSubjectUnion<C>,
> = CommandHooks<H, SU> & {
  execute<T extends SU>(subject: T, object: CommandObject<C>): CommandReturn<C>;
};
