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
 *   constrained by `CommandSubjectStrategies<C>`, which is the intersection of
 *   all required visit methods. If any visit method is missing, `run` becomes
 *   uncallable at the call site.
 *
 * - **Subject union enforcement**: `run` only accepts Subjects that are in the
 *   Command's declared subject union (`CSU`). Passing an unsupported Subject is
 *   a compile error.
 *
 * - **Literal visitName**: `SubjectVisitName<S>` rejects non-literal `string`
 *   types, ensuring visit method keys are statically known. A Subject with
 *   `visitName: string` (non-literal) produces `never` keys, making
 *   CommandSubjectStrategies unsatisfiable.
 *
 * - **Duplicate visitName detection**: If two Subjects in the same Command's
 *   union share a `visitName`, `UnionToIntersection` merges their visit handler
 *   signatures into an impossible intersection (e.g. `(s: Dog & Cat) => ...`),
 *   making the visit method unimplementable.
 *
 * - **Hook presence and subject coverage**: `CommandHooks<H, SU>` requires the
 *   Template to have a property for each hook Command, keyed by `commandName`,
 *   AND enforces that each hook Command declares visit methods for every Subject
 *   in `SU`. A hook missing any required visit method resolves to `never` at
 *   the `implements` site — no value of the hook's class satisfies `never`,
 *   producing a compile error.
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
 * Returns `never` if the Subject's `visitName` is the wide `string` type
 * rather than a string literal. This prevents non-literal visitNames from
 * participating in dispatch — they would produce `never`-keyed visit methods
 * in `Visit<C, SU>`, making `CommandSubjectStrategies` impossible to satisfy.
 *
 * @example
 * class Dog extends Subject { readonly visitName = "resolveDog" as const; }
 * type T = SubjectVisitName<Dog>;  // "resolveDog"
 *
 * class Bad extends Subject { readonly visitName: string = "oops"; }
 * type T = SubjectVisitName<Bad>;  // never
 */
/** Extracts the `visitName` string literal type from a Subject. Returns `never` for non-literal visitName. */
export type SubjectVisitName<S> = S extends { visitName: infer K extends string }
  ? string extends K
    ? never
    : K
  : never;

/*
 * Extracts the `commandName` string literal type from a Command.
 *
 * Returns `never` if the Command's `commandName` is the wide `string` type.
 * Used by `CommandHooks<SU, H>` to key hook properties on the Template type.
 *
 * @example
 * class FeedCmd extends Command<...> { readonly commandName = "feed" as const; }
 * type T = CommandName<FeedCmd>;  // "feed"
 */
/** Extracts the `commandName` string literal type from a Command. */
export type CommandName<C> = C extends { commandName: infer K extends string }
  ? string extends K
    ? never
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
/** Extracts the object type (`O`) from a Command — the context/payload passed to visit methods and `execute`. */
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
/** Extracts the return type (`R`) from a Command — the result of `run()` and `execute()`. */
export type CommandReturn<C> = C extends Command<any, any, infer R, any> ? R : never;

// ─── Internal Type Utilities ─────────────────────────────────────

/*
 * Shorthand for the fully-open Command type.
 * Used as a constraint throughout the type machinery.
 */
type AnyCommand = Command<any, any, any, any>;

/*
 * Extracts the Subject union from a Command's `CSU` tuple parameter.
 *
 * Given `Command<B, O, R, [Student, Professor]>`, produces `Student | Professor`.
 * This is the set of Subjects the Command can dispatch to.
 *
 * Note: when used inside type parameter constraints, the `infer CSU` may resolve
 * to `any` for class types. This is a TypeScript limitation that affects constraint
 * enforcement but not runtime behavior. `CommandHooks<SU, H>` avoids this by
 * evaluating coverage at the `implements` site rather than in constraint position.
 */
/** Extracts the Subject union from a Command — the set of Subjects the Command can dispatch to. */
export type CommandSubjectUnion<C> =
  C extends Command<any, any, any, infer CSU> ? CSU[number] : never;

/*
 * Defines the signature of a single visit method on a Command.
 *
 * For a given Command `C` and Subject type `SU`, produces an object type
 * with a single method keyed by `SubjectVisitName<SU>`. The method receives
 * the Subject and a `Readonly` view of the object, and returns a Template.
 *
 * The object is `Readonly` in the visit method signature to signal that
 * strategy selection should not mutate the object — mutation belongs in
 * `execute`.
 *
 * The return type erases hooks to `any[]` — hook validation occurs at the
 * Template implementation site (`implements Template<C, H, SU>`), not at
 * the visit-method return boundary. This avoids requiring visit methods to
 * declare the full hook parameterization.
 *
 * @example
 * // For Command<Person, Building, Result, [Student, Professor]> and SU = Student:
 * // Visit<C, Student> = { resolveStudent: (s: Student, o: Readonly<Building>) => Template<C, any[], Student> }
 */
type Visit<C extends AnyCommand, SU extends CommandSubjectUnion<C>> = {
  [K in SubjectVisitName<SU>]: (
    subject: SU,
    object: Readonly<CommandObject<C>>,
  ) => Template<C, any[], SU>;
};

/*
 * Converts a union type to an intersection type.
 *
 * Used to merge per-Subject visit method types into a single object type
 * that a Command must satisfy. For example, given Subjects Dog and Cat:
 * `{ resolveDog: ... } | { resolveCat: ... }` → `{ resolveDog: ... } & { resolveCat: ... }`
 *
 * This is also the mechanism that catches duplicate `visitName` values:
 * two Subjects with the same visitName produce conflicting function signatures
 * in the intersection, making the handler unimplementable.
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/*
 * Computes the full set of visit methods a Command must implement.
 *
 * Maps each Subject in the Command's `CSU` tuple to a `Visit<C, Subject>` type,
 * collects them into a union via `[number]` indexing, then intersects them
 * via `UnionToIntersection`. The result is an object type with one method per
 * Subject, each keyed by that Subject's `visitName`.
 *
 * This type is used as a `this` parameter constraint on `Command.run()`.
 * If the Command subclass is missing any visit method, the `this` constraint
 * is unsatisfied and `run` becomes uncallable at the call site.
 *
 * When any Subject in CSU has a non-literal `visitName` (i.e. typed as `string`
 * rather than a string literal), the `this` constraint becomes an impossible
 * structural requirement — `run` is uncallable at the call site with a
 * descriptive property name explaining the issue.
 *
 * @example
 * // For Command<Person, Building, Result, [Student, Professor]>:
 * // CommandSubjectStrategies<C> = {
 * //   resolveStudent: (s: Student, o: Readonly<Building>) => Template<...>;
 * //   resolveProfessor: (s: Professor, o: Readonly<Building>) => Template<...>;
 * // }
 */
type CommandSubjectStrategies<C extends AnyCommand> =
  C extends Command<any, any, any, infer CSU>
    ? UnionToIntersection<{ [K in keyof CSU]: Visit<C, CSU[K]> }[number]>
    : never;

/*
 * Produces an impossible structural requirement on `run()`'s `this` parameter
 * when any Subject in `CSU` declares `visitName` as the wide `string` type.
 *
 * When all `visitName` values are literals this resolves to `Record<never, never>`
 * (i.e. `{}`), which is trivially satisfied by any type.
 *
 * When any `visitName` is non-literal, this resolves to an object type with a
 * single required property whose key is a descriptive error message and whose
 * value is `never`. Since no class can satisfy `{ "Error:...": never }`, `run()`
 * becomes uncallable at the call site — a compile-time error with a clear message.
 *
 * The `any` case must short-circuit to `Record<never, never>` (via `0 extends
 * 1 & CSU[number]`) to preserve AnyCommand structural compatibility. Without it,
 * `string extends any["visitName"]` is `true`, which would make AnyCommand's
 * `run()` uncallable and break all Template hook constraints.
 */
type WidenedVisitNameError =
  "visitName must be a literal. Fix: readonly visitName = 'resolveFoo' as const";

type WithLiteralVisitNames<CSU extends Subject[]> =
  // IsAny guard: 0 extends (1 & T) is only true when T is `any`.
  0 extends 1 & CSU[number]
    ? Record<never, never>
    : string extends CSU[number]["visitName"]
      ? { [K in WidenedVisitNameError]: never }
      : Record<never, never>;

/*
 * Maps a tuple of hook Commands to an object type keyed by their `commandName`,
 * enforcing that each hook Command has a visit method for every Subject in `SU`.
 *
 * For each hook Command `Cmd` in `H`:
 * - If `Cmd` declares a visit method for every Subject in `SU`
 *   (i.e. has a property matching each `SubjectVisitName<SU>` key),
 *   the property resolves to `Cmd` — the implementing class satisfies it normally.
 * - If the hook is missing any visit method required by `SU`, the property
 *   resolves to `never` — no value of type `Cmd` can satisfy `never`,
 *   so the `implements` check fails at the declaration site.
 *
 * **Why visit-method presence instead of `CommandSubjectUnion<Cmd>`:**
 * TypeScript defers `infer`-based conditional type evaluation for type variables
 * inside mapped type bodies. `CommandSubjectUnion<Cmd>` uses `infer CSU` on the
 * Command class hierarchy — when `Cmd` is the mapped type iteration variable,
 * TypeScript evaluates it against the constraint (`AnyCommand`), which has
 * `CSU = any`, making the coverage check always pass.
 *
 * `Cmd extends { [K in SubjectVisitName<SU>]: any }` is a simple structural
 * extends check (no inference). TypeScript evaluates this concretely per union
 * member, checking whether the actual Command class declares the expected visit
 * method names. This bypasses the `infer` deferral problem entirely.
 *
 * @example
 * // LogCommand handles [Cat, Dog, Bird] — has resolveCat, resolveDog, resolveBird
 * // CommandHooks<[LogCommand], Cat | Dog>:
 * //   LogCommand extends { resolveCat: any, resolveDog: any } → true → { log: LogCommand }
 *
 * // CatOnlyCommand handles [Cat] — has resolveCat only
 * // CommandHooks<[CatOnlyCommand], Cat | Dog>:
 * //   CatOnlyCommand extends { resolveCat: any, resolveDog: any } → false → { log: never }
 */
type CommandHooks<H extends AnyCommand[], SU extends Subject> = {
  [Cmd in H[number] as CommandName<Cmd>]: Cmd extends {
    [K in SubjectVisitName<SU>]: any;
  }
    ? Cmd
    : never;
};

// ─── Core Classes ────────────────────────────────────────────────

/*
 * Abstract base class for all Commands.
 *
 * A Command represents an operation that can be performed on a set of Subjects.
 * Subclasses must:
 *
 * 1. Declare `readonly commandName` as a string literal (used for hook keying).
 * 2. Implement one visit method per Subject in `CSU`, named after that Subject's
 *    `visitName`. Each visit method receives the Subject and the object, and
 *    returns a Template (strategy) to execute.
 *
 * ## Generic Parameters
 *
 * - `B` — Base type. All Subjects in `CSU` must extend `B & Subject`.
 *         Allows constraining Subjects to share a common interface
 *         (e.g. `Person`, `Node`).
 * - `O` — Object type. The context/payload passed to both visit methods
 *         and `execute`. Available during strategy selection and execution.
 * - `R` — Return type. The result of `execute` and `run`. Use `Promise<T>`
 *         for async Commands.
 * - `CSU` — Subject tuple. The ordered list of Subject types this Command
 *          dispatches to. Each element must extend `B & Subject`. The tuple
 *          drives exhaustive visit method checking.
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
 * The `this` parameter constraint (`this & CommandSubjectStrategies<C>`)
 * ensures all visit methods are present. The error surfaces at the call site
 * when any visit method is missing — `run` becomes uncallable.
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
export abstract class Command<B, O, R, CSU extends (B & Subject)[]> {
  abstract readonly commandName: string;

  run<T extends CommandSubjectUnion<Command<B, O, R, CSU>>>(
    this: this & CommandSubjectStrategies<Command<B, O, R, CSU>> & WithLiteralVisitNames<CSU>,
    subject: T,
    object: O,
  ): R {
    const strategy = subject.getCommandStrategy(this, object);
    return strategy.execute(subject, object);
  }
}

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
 *   `SubjectVisitName<S>` which returns `never` for non-literals.
 * - Unique across all Subjects used within the same Command's subject union —
 *   duplicates are caught by `UnionToIntersection` producing impossible
 *   handler signatures.
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
 * The `this` parameter constraint (`this & SU`) ensures the Subject
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
  getCommandStrategy<C extends AnyCommand, SU extends CommandSubjectUnion<C>>(
    this: this & SU,
    command: Visit<C, SU>,
    object: CommandObject<C>,
  ): Template<C, any[], SU> {
    const methodName = this.visitName as SubjectVisitName<SU>;
    return command[methodName](this, object);
  }
}

// ─── Template ────────────────────────────────────────────────────

/*
 * The strategy type. Defines the contract for executing a Command's
 * operation on a Subject.
 *
 * A Template combines:
 * - `execute(subject, object)` — the execution logic
 * - `CommandHooks<SU, H>` — structural properties referencing other Commands
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
 * - `SU` — Command Subject Union. The subset of `C`'s subject union that this
 *          Template handles. Defaults to the full union (`CommandSubjectUnion<C>`).
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
 *    to `never`, making the `implements` check fail. For example, a `LogCommand`
 *    that only handles `Cat` (declaring only `resolveCat`) cannot satisfy
 *    `Template<C, [LogCommand], Cat | Dog>` because it is missing `resolveDog`.
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
