/*
 * codascon YAML Configuration Schema
 *
 * Declarative schema for describing a codascon domain — the Subjects, Commands,
 * Templates, and Strategies that constitute the structural protocol. This schema
 * captures enough information to scaffold TypeScript class hierarchies and to
 * validate architectural constraints at config-authoring time.
 *
 * ## Purpose
 *
 * codascon is a structural protocol for code architecture with exhaustive
 * compile-time type checking, combining the Visitor, Command, and Strategy
 * patterns. This schema serves as the declarative surface for that protocol:
 * it describes *what* the domain looks like without prescribing implementation
 * details like instantiation strategy, dependency injection wiring, or
 * runtime lifecycle.
 *
 * ## Key Concepts
 *
 * - **DomainType**: Any type in the domain. Types with a `resolverName` are
 *   Subjects (entities that participate in double dispatch). Types without
 *   are plain types used as object types, return types, or base types.
 *
 * - **Command**: An operation performed on Subjects. Declares its generic
 *   parameters (base type, object type, return type, subject union) and
 *   its dispatch map — which Template or Strategy handles each Subject.
 *   A Command may also declare an ordered list of middleware to apply.
 *
 * - **MiddlewareCommand**: An interceptor for a Command's dispatch. Declared
 *   in the top-level `middleware` map. Structurally identical to a Command —
 *   same generic parameters, same dispatch map, same templates — but generates
 *   a class extending `MiddlewareCommand<B, O, R, BSL>` rather than
 *   `Command<B, O, R, BSL>`. A middleware's `subjectUnion` must be a superset
 *   of every Command it is registered in (coverage, not equality).
 *
 * - **Template**: The strategy interface/abstract class. Declares which
 *   Command it serves, its hook dependencies (other Commands invoked during
 *   execution), and optionally narrows the subject union. Contains zero or
 *   more Strategies.
 *
 * - **Strategy**: A concrete extension of a Template. May further narrow the
 *   subject union (for parameterized Templates) and override hook bindings.
 *
 * ## Dispatch Reference Format
 *
 * The `dispatch` map on a Command maps each Subject to the set of Strategies it
 * may legally route to. A value is either a single plain Strategy name or a list
 * of them — both are plain (unqualified) Strategy names looked up across the
 * Templates of the same Command:
 *
 * - `"StrategyName"` (scalar) — the Subject always resolves to this one Strategy.
 * - `["StrategyA", "StrategyB"]` (list) — the Subject's legal codomain is this
 *   set; the runtime choice between them is made in the generated resolver body.
 *
 * A scalar is exactly equivalent to a one-element list — tooling normalizes
 * `scalar → [scalar]` internally, so all downstream logic is uniform. Codegen
 * then diverges on cardinality:
 *
 * - **Singleton** (scalar, or 1-element list) → a COMPLETE resolver returning
 *   that Strategy (`return this.<singleton>;`).
 * - **Multi-entry list** → a resolver STUB whose declared return type is the
 *   union of the candidate Strategy classes (`StrategyA | StrategyB`), with body
 *   `throw new Error("Not implemented")`. The union narrows the codomain: once a
 *   candidate Strategy carries distinguishing implementation, returning a Strategy
 *   outside the declared set is a compile error. (TypeScript matches structurally,
 *   so empty, identical stub classes stay mutually assignable until they gain
 *   real members — the constraint bites as soon as it has something to bite on.)
 *   The developer fills in the runtime choice.
 *
 * ## Validation Rules
 *
 * The following constraints should be enforced by tooling consuming this schema:
 *
 * 1. **Resolution partition**: A Command's `dispatch` keys and `defaultedSubjects`
 *    form a typed partition of `subjectUnion` — every Subject must appear in exactly
 *    one of the two (total and disjoint). Subjects in `dispatch` are resolved by a
 *    specific Strategy; Subjects in `defaultedSubjects` are routed to `defaultResolver`
 *    at runtime. A Subject in neither is a validation error (it would otherwise be
 *    silently absorbed). `defaultedSubjects` non-empty ⟺ `defaultResolver` declared.
 *    This applies to MiddlewareCommands too — a middleware is a Command in the full
 *    sense and partitions its subjects the same way.
 *
 * 2. **Dispatch target validity**: Every candidate in a dispatch value must be a
 *    plain Strategy name, looked up across the Templates of the same Command. The
 *    check is per-candidate over the (normalized) list — a single bad candidate
 *    in an otherwise valid list is an error. A candidate's parent template's
 *    effective `subjectSubset` must cover the dispatched Subject. An empty
 *    candidate list is invalid (a dispatch entry must name at least one Strategy).
 *
 * 3. **Subject identity**: A `domainTypes` entry with a `resolverName` property
 *    is a Subject; without it, a plain type. All entries in a Command's
 *    `subjectUnion` must reference Subjects (types with `resolverName`).
 *
 * 4. **resolverName convention**: By convention, `resolverName` should be prefixed
 *    with `"resolve"` (e.g. `"resolveStudent"`). The resolverName must be unique
 *    across all Subjects used within the same Command's subject union.
 *
 * 5. **Template subjectSubset**: When provided, must be a subset of the
 *    parent Command's `subjectUnion`. When omitted, defaults to the
 *    full `subjectUnion`.
 *
 * 6. **Strategy subjectSubset**: Must be a subset of the parent Template's
 *    effective `subjectSubset`. Only meaningful when the Template's
 *    `isParameterized` is `true`; ignored otherwise.
 *
 * 7. **Strategy commandHooks**: Keys must be a subset of the parent Template's
 *    `commandHooks` keys. Strategies only override or instantiate hooks
 *    declared by their Template — they do not introduce new hooks.
 *
 * 8. **Template commandHooks values**: Must reference entries in `commands`
 *    or `middleware`.
 *
 * 9. **Template abstractness**: All Templates generate as abstract classes.
 *    Dispatch must not reference Templates directly — only Strategy names
 *    (from a Template's `strategies` map) are valid dispatch targets.
 *
 * 10. **Middleware reference validity**: Every entry in a Command's
 *     `middleware` list must reference a key in the top-level `middleware`
 *     map.
 *
 * 11. **Middleware coverage**: Each middleware in a Command's `middleware`
 *     list must declare a `subjectUnion` that is a superset of (or equal to)
 *     the Command's `subjectUnion`. A middleware covering fewer Subjects than
 *     the Command would leave some Subjects unintercepted.
 *
 * 12. **defaultResolver strategy validity**: When `defaultResolver` is
 *     present, the named Strategy must exist within the Command's templates.
 *     Its effective `subjectSubset` — the Strategy's own `subjectSubset` if
 *     declared, otherwise the parent Template's `subjectSubset`, otherwise
 *     the full command subject union — must cover every subject in the
 *     Command's `subjectUnion`.
 *
 * ## Out of Scope
 *
 * The following are client implementation details not captured by this schema:
 *
 * - **Instantiation strategy**: Whether strategies are singletons, shared
 *   instances, or newly constructed per dispatch. This is determined by the
 *   Command's resolver method implementation.
 *
 * - **Constructor wiring / DI**: How Commands, Templates, and Strategies
 *   receive their dependencies. Hooks may be injected via constructor,
 *   instantiated internally, or inherited from the Template.
 *
 * - **Execute body**: Codegen emits a concrete `execute` stub on every
 *   Template (abstract or concrete). Strategies do not get an `execute`
 *   scaffold — they inherit it from the Template. Whether the client
 *   implements the body on the Template, overrides it in a Strategy, or
 *   delegates to a protected abstract method is entirely their choice.
 *
 * - **Hook instantiation**: Whether a hook is abstract on the Template
 *   (Strategy must instantiate) or concrete (shared across Strategies).
 *   Both are valid; the schema declares the hook dependency, not its
 *   lifecycle.
 *
 * - **Middleware instantiation**: How MiddlewareCommand instances are created
 *   and passed to the `override get middleware()` getter is a client detail.
 *   Codegen emits the getter stub; injection strategy is left to the client.
 *
 * ## Example
 *
 * ```yaml
 * namespace: campus
 *
 * domainTypes:
 *   CampusPerson:
 *     name: string
 *     department: string
 *   Student:
 *     resolverName: resolveStudent
 *     year: number
 *     gpa: number
 *   Professor:
 *     resolverName: resolveProfessor
 *     tenured: boolean
 *   Building:
 *     name: string
 *     department: string
 *     clearanceRequired: number
 *   AccessResult:
 *     granted: boolean
 *     reason: string
 *
 * middleware:
 *   AuditMiddleware:
 *     commandName: auditMiddleware
 *     baseType: CampusPerson
 *     objectType: Building
 *     returnType: AccessResult
 *     subjectUnion: [Student, Professor]
 *     dispatch:
 *       Student: AuditTrace
 *       Professor: AuditTrace
 *     templates:
 *       AuditTemplate:
 *         isParameterized: false
 *         strategies:
 *           AuditTrace: {}
 *
 * commands:
 *   AccessBuildingCommand:
 *     commandName: accessBuilding
 *     baseType: CampusPerson
 *     objectType: Building
 *     returnType: AccessResult
 *     subjectUnion: [Student, Professor]
 *     middleware: [AuditMiddleware]
 *     dispatch:
 *       Student: DepartmentMatch
 *       Professor: GrantAccessDefault
 *     templates:
 *       AccessTemplate:
 *         isParameterized: true
 *         commandHooks:
 *           audit: AuditCommand
 *         subjectSubset: [Student, Professor]
 *         strategies:
 *           DepartmentMatch:
 *             subjectSubset: [Student]
 *           ClearanceGated:
 *             subjectSubset: [Professor]
 *             commandHooks:
 *               audit: StrictAuditCommand
 *       GrantAccess:
 *         isParameterized: false
 *         strategies:
 *           GrantAccessDefault: {}
 * ```
 *
 */

// ─── Primitives ──────────────────────────────────────────────────

/** Key in `domainTypes` — any domain type, plain or Subject. */
export type DomainTypeRef = string;

/** Key in `domainTypes` that must have `resolverName` (a Subject). */
export type SubjectRef = string;

/** Key in `commands` or `middleware`. */
export type CommandRef = string;

/** Unqualified reference to a Template: `"TemplateName"`. */
export type TemplateRef = string;

/** Unqualified reference to a Strategy: `"StrategyName"`. */
export type StrategyRef = string;

/** Key in the top-level `middleware` map — a MiddlewareCommand entry. */
export type MiddlewareRef = string;

// ─── Domain Types ────────────────────────────────────────────────

/*
 * A type referenced in the codascon protocol — as a base type, object type,
 * return type, or Subject (dispatch participant).
 *
 * The presence of `resolverName` is the only structural distinction:
 *
 * **With `resolverName`**: This is a Subject — an entity that participates in
 * double dispatch. The `resolverName` must be a unique string literal, by
 * convention prefixed with `"resolve"` (e.g. `"resolveStudent"`).
 *
 * **Without `resolverName`**: This is a plain type — an interface, result type,
 * context object, or base type. It does not participate in dispatch.
 */
/** A domain type: plain type (no `resolverName`) or Subject (has `resolverName`). */
export type DomainType = {
  resolverName?: string;
};

// ─── Command ─────────────────────────────────────────────────────

/*
 * An operation that can be performed on Subjects.
 *
 * Maps directly to a class extending `Command<B, O, R, CSU>` in the
 * framework. The Command's resolver methods (one per Subject in the union)
 * are not declared here — they are derived from `subjectUnion` entries
 * and their `resolverName` values. The `dispatch` map specifies which
 * Template or Strategy each resolver method resolves to.
 *
 * @property commandName    — The string literal used as the Command's
 *                            `commandName` property. Also used as the key
 *                            in `CommandHooks<H>` when this Command is a
 *                            hook on a Template.
 *
 * @property baseType       — The `B` generic parameter. All Subjects in
 *                            `subjectUnion` must extend `B & Subject`.
 *                            Use this to constrain Subjects to share a
 *                            common interface (e.g. `CampusPerson`).
 *
 * @property objectType     — The `O` generic parameter. The context/payload
 *                            passed alongside the Subject to both visit
 *                            methods (for strategy selection) and `execute`
 *                            (for execution).
 *
 * @property returnType     — The `R` generic parameter. The result type of
 *                            `execute` and `run`. Use `Promise<T>` for
 *                            async Commands.
 *
 * @property subjectUnion   — The `CSU` tuple. References to domain types
 *                            that have `resolverName` (i.e. Subjects). Each
 *                            entry requires a corresponding resolver method
 *                            on the Command class, enforced at compile time
 *                            by `CommandSubjectStrategies<C>`.
 *
 * @property dispatch       — Maps each Subject to its legal resolution codomain.
 *                            Keys are Subject type references (must match
 *                            entries in `subjectUnion`). A value is either a
 *                            single plain Strategy name or a list of them,
 *                            looked up across the Templates of the same Command.
 *                            A scalar is equivalent to a one-element list; a
 *                            single candidate generates a complete resolver, a
 *                            multi-candidate list generates a resolver stub whose
 *                            return type is the union of the candidate Strategy
 *                            classes (see "Dispatch Reference Format").
 *                            The resolverName for each Subject key is derived
 *                            from the Subject's `resolverName` in `domainTypes`.
 *
 * @property middleware      — Optional ordered list of middleware to register
 *                            for this Command. Each entry is a key in the
 *                            top-level `middleware` map. Middleware is applied
 *                            in list order — the first entry is outermost
 *                            (runs first, finishes last).
 *
 *                            Each listed middleware must cover all Subjects in
 *                            this Command's `subjectUnion` (middleware BSL ⊇
 *                            command BSL — coverage, not equality). Codegen
 *                            emits an `override get middleware()` getter on the
 *                            Command class returning the registered instances.
 *
 * @property defaultedSubjects — Optional list of Subjects that are intentionally
 *                            default-resolved. These Subjects are NOT given a
 *                            `dispatch` entry; instead they route to `defaultResolver`
 *                            at runtime. Together with the `dispatch` keys they must
 *                            partition `subjectUnion` (total + disjoint). Maps to the
 *                            generated Command's `BDS` (Base Defaulted Subjects) type
 *                            parameter: `Command<B, O, R, [dispatch keys], [defaultedSubjects]>`.
 *                            When empty/absent, the Command is fully resolved and codegen
 *                            emits the 4-argument `Command<B, O, R, [subjectUnion]>` form.
 *
 * @property defaultResolver — The catch-all Strategy handling the `defaultedSubjects`
 *                            Subjects. Required exactly when `defaultedSubjects` is
 *                            non-empty; declaring it without `defaultedSubjects` is a
 *                            validation error (the defaulted Subjects must be explicit).
 *
 *                            Codegen emits a `readonly defaultResolver` property
 *                            on the Command class, typed as the referenced Strategy
 *                            class and initialized to the corresponding singleton
 *                            field (shared with the dispatch singleton pool). Resolver
 *                            stubs are generated only for the resolved Subjects (the
 *                            `dispatch` keys) — the defaulted Subjects route to
 *                            `defaultResolver` via the runtime fallback.
 *
 *                            The referenced Strategy must exist within this
 *                            Command's templates and its effective
 *                            `subjectSubset` — the Strategy's own
 *                            `subjectSubset` if declared, otherwise the parent
 *                            Template's `subjectSubset`, otherwise the full
 *                            command subject union — must cover every Subject
 *                            in `defaultedSubjects` (validation rule 12).
 *
 * @property templates      — All Templates (strategy implementations) for
 *                            this Command, keyed by class name. Each Template
 *                            declares its subject narrowing, hooks, and
 *                            nested Strategies. The Template's parent Command
 *                            is implicit from this nesting — no explicit
 *                            `commandRef` is needed.
 *
 *                            Dispatch targets are plain Strategy names,
 *                            looked up across these Templates.
 *
 *                            All Templates generate as abstract classes.
 *                            Only Strategy names (from this map) are valid
 *                            as dispatch targets.
 */
/** A Command entry in the YAML config — declares generic params, middleware, dispatch map, and templates. */
export type Command = {
  commandName: string;
  baseType: DomainTypeRef;
  objectType: DomainTypeRef;
  returnType: DomainTypeRef;
  returnAsync?: boolean;
  subjectUnion: SubjectRef[];
  middleware?: MiddlewareRef[];
  defaultedSubjects?: SubjectRef[];
  defaultResolver?: StrategyRef;
  dispatch: {
    [subject: SubjectRef]: StrategyRef | StrategyRef[];
  };
  templates: {
    [key: string]: Template;
  };
};

// ─── Template ────────────────────────────────────────────────────

/*
 * The strategy interface / abstract class.
 *
 * Maps to an abstract class implementing `Template<C, H, SU>` in the framework.
 * All Templates generate as abstract classes, regardless of whether `strategies`
 * is empty or non-empty. Dispatch must reference Strategy names only — Templates
 * themselves are never valid dispatch targets.
 *
 * The parent Command is implicit from nesting — Templates are defined
 * within the `templates` map of their owning Command. The `C` generic
 * parameter in `Template<C, H, SU>` is derived from this parent.
 *
 * @property isParameterized — Whether the Template's SU is a type
 *                             parameter that Strategies instantiate.
 *
 *   When `true`, the Template class is generic over SU:
 *   ```ts
 *   abstract class AccessTemplate<SU extends CommandSubjectUnion<AccessCmd>>
 *     implements Template<AccessCmd, [AuditCmd], SU> { ... }
 *   ```
 *   Strategies extend it with a concrete SU:
 *   ```ts
 *   class DepartmentMatch extends AccessTemplate<Student> { ... }
 *   ```
 *
 *   When `false`, the Template's SU is fixed (either the full Command
 *   subject union or the declared `subjectSubset`). Strategy
 *   `subjectSubset` is ignored in this case.
 *
 * @property commandHooks   — Other Commands (or MiddlewareCommands) that the
 *                            Template's `execute` method may invoke during
 *                            execution. Keys are the property names on the
 *                            Template class (derived from the hook Command's
 *                            `commandName`). Values reference entries in
 *                            `commands` or `middleware`.
 *
 *                            In the framework, these become the `H` parameter
 *                            on `Template<C, H, SU>` and are enforced
 *                            structurally via `CommandHooks<H>`.
 *
 *                            Hooks can be:
 *                            - Concrete on the Template (shared across
 *                              all Strategies)
 *                            - Abstract on the Template (each Strategy
 *                              provides its own instance)
 *                            - Overridden by a Strategy
 *                            - Injected via constructor during resolution
 *
 *                            The `H` parameter should be provided (concrete),
 *                            not parameterized. Hooks are part of the
 *                            Template's contract, not chosen by Strategies.
 *
 * @property subjectSubset  — Optional narrowing of the parent Command's
 *                            subject union. When provided, must be a subset
 *                            of the Command's `subjectUnion`. When omitted,
 *                            defaults to the full `subjectUnion`.
 *
 *                            This becomes the `SU` parameter (or its
 *                            constraint, when `isParameterized` is true).
 *
 * @property strategies     — Concrete extensions of this Template. Required
 *                            — explicit emptiness signals intent. All Templates
 *                            generate as abstract classes regardless of whether
 *                            this map is empty or non-empty. Only Strategy names
 *                            (from this map) may appear as dispatch targets.
 */
/** A Template entry — declares `isParameterized`, hook dependencies, subject narrowing, and strategies. */
export type Template = {
  isParameterized: boolean;
  commandHooks?: {
    [propertyName: string]: CommandRef;
  };
  subjectSubset?: SubjectRef[];
  strategies: {
    [key: string]: Strategy;
  };
};

// ─── Strategy ────────────────────────────────────────────────────

/*
 * A concrete extension of a Template.
 *
 * Strategies extend their parent Template class. For parameterized
 * Templates, the Strategy instantiates the type parameter with its
 * chosen subject subset.
 *
 * In dispatch references, Strategies are referenced by their plain name.
 *
 * @property subjectSubset  — The SU narrowing this Strategy applies.
 *                            Must be a subset of the parent Template's
 *                            effective `subjectSubset`.
 *
 *                            Only meaningful when the parent Template's
 *                            `isParameterized` is `true`. In that case,
 *                            this is the concrete type argument passed
 *                            to the parameterized Template:
 *                            ```ts
 *                            class DepartmentMatch extends AccessTemplate<Student> { ... }
 *                            //                       subjectSubset: [Student] ^^^^^^^
 *                            ```
 *
 *                            Ignored when `isParameterized` is `false`.
 *
 * @property commandHooks   — Hook overrides. Keys must be a subset of the
 *                            parent Template's `commandHooks` keys —
 *                            Strategies do not introduce new hooks. Values
 *                            reference entries in `commands` or `middleware`.
 *
 *                            Use this when the Strategy needs a different
 *                            concrete Command for a hook than what the
 *                            Template provides (or when the Template
 *                            declares the hook as abstract and the Strategy
 *                            must supply it).
 */
/** A Strategy entry — concrete extension of a Template, optionally narrowing subject subset or overriding hooks. */
export type Strategy = {
  subjectSubset?: SubjectRef[];
  commandHooks?: {
    [key: string]: CommandRef;
  };
};

// ─── Root Schema ─────────────────────────────────────────────────

/*
 * Root configuration schema for a codascon domain.
 *
 * A single YAML file conforming to this schema describes one bounded
 * domain — its types, operations, and strategy topology.
 *
 * @property namespace           — Optional namespace for the generated code.
 *                                 May be used by codegen to scope imports,
 *                                 file paths, or module names.
 *
 * @property typeImports         — External types imported from libraries or
 *                                 other packages, available for use anywhere
 *                                 in the spec: as field types on `domainTypes`,
 *                                 as generic parameters on `commands`, or in
 *                                 the signatures of `templates` and `strategies`.
 *                                 Maps module specifiers to lists of type names.
 *                                 Codegen emits an `import type` for each entry.
 *
 *                                 These types are not first-class domain
 *                                 participants — they cannot appear in structural
 *                                 positions such as `subjectUnion` or `dispatch`.
 *                                 Only `domainTypes` entries are first-class.
 *
 *                                 ```yaml
 *                                 typeImports:
 *                                   "ts-morph": [Project, SourceFile]
 *                                   "../schema.js": [DomainType, Command]
 *                                 ```
 *
 * @property domainTypes         — All types in the domain, keyed by name.
 *                            Types with `resolverName` are Subjects; types
 *                            without are plain types (interfaces, result
 *                            types, context objects, base types).
 *
 * @property middleware      — Optional map of MiddlewareCommands, keyed by
 *                            class name. Each entry declares a
 *                            MiddlewareCommand — an interceptor that wraps
 *                            Command dispatch. Structurally identical to a
 *                            Command entry (same generic parameters, same
 *                            dispatch map, same templates), but generates a
 *                            class extending `MiddlewareCommand<B, O, R, BSL>`
 *                            rather than `Command<B, O, R, BSL>`.
 *
 *                            Middleware is separated from `commands` for
 *                            semantic clarity — both are operations, but their
 *                            roles differ: Commands produce results, Middleware
 *                            intercepts dispatch chains. Having them in distinct
 *                            maps makes this distinction explicit at the schema
 *                            level without introducing a different structural
 *                            type.
 *
 * @property commands       — All Commands, keyed by class name. Each
 *                            Command declares its generic parameters, its
 *                            optional middleware list, its dispatch map,
 *                            and its Templates (with nested Strategies).
 */
/** Root schema for a codascon domain YAML config — declares namespace, type imports, domain types, middleware, and commands. */
export interface YamlConfig {
  namespace?: string;
  typeImports?: {
    [moduleSpecifier: string]: string[];
  };
  domainTypes: {
    [key: string]: DomainType;
  };
  middleware?: {
    [key: string]: Command;
  };
  commands: {
    [key: string]: Command;
  };
}
