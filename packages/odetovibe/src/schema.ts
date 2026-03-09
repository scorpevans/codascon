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
 * codascon is a structural protocol for code organization with exhaustive
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
 * The `dispatch` map on a Command maps Subject names to resolution targets:
 *
 * - `"TemplateName"` — Dispatches directly to a concrete Template
 *   (only valid when the Template has no strategies, i.e. `strategies: {}`)
 * - `"TemplateName.StrategyName"` — Dispatches to a specific Strategy
 *   within a Template
 *
 * ## Validation Rules
 *
 * The following constraints should be enforced by tooling consuming this schema:
 *
 * 1. **Dispatch coverage**: Every Subject in a Command's `subjectUnion` must
 *    have exactly one entry in its `dispatch` map.
 *
 * 2. **Dispatch target validity**: Values referencing a Template directly are
 *    only valid when that Template's `strategies` is empty (`{}`). Values
 *    referencing a Strategy use the `TemplateName.StrategyName` format, and
 *    both parts must resolve to entries in the parent Command's `templates` map.
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
 * 8. **Template commandHooks values**: Must reference entries in `commands`.
 *
 * 9. **Template abstractness**: A Template with a non-empty `strategies` map
 *    should be generated as an abstract class. Dispatch should not reference
 *    such a Template directly (only its Strategies). A Template with an empty
 *    `strategies` map (`{}`) is concrete and may be referenced directly in
 *    dispatch.
 *
 * ## Out of Scope
 *
 * The following are client implementation details not captured by this schema:
 *
 * - **Instantiation strategy**: Whether strategies are singletons, shared
 *   instances, or newly constructed per dispatch. This is determined by the
 *   Command's visit method implementation.
 *
 * - **Constructor wiring / DI**: How Commands, Templates, and Strategies
 *   receive their dependencies. Hooks may be injected via constructor,
 *   instantiated internally, or inherited from the Template.
 *
 * - **Execute ownership**: Whether `execute` is implemented on the Template
 *   or deferred to Strategies. The recommended pattern is for the Template
 *   to implement `execute` and delegate to abstract/protected methods.
 *
 * - **Hook instantiation**: Whether a hook is abstract on the Template
 *   (Strategy must instantiate) or concrete (shared across Strategies).
 *   Both are valid; the schema declares the hook dependency, not its
 *   lifecycle.
 *
 * - **Run method overrides**: Commands may override `run` for cross-cutting
 *   concerns (auditing, logging, pre/post-processing).
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
 * commands:
 *   AccessBuildingCommand:
 *     commandName: accessBuilding
 *     baseType: CampusPerson
 *     objectType: Building
 *     returnType: AccessResult
 *     subjectUnion: [Student, Professor]
 *     dispatch:
 *       Student: AccessTemplate.DepartmentMatch
 *       Professor: GrantAccess
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
 *         strategies: {}
 * ```
 *
 */

// ─── Primitives ──────────────────────────────────────────────────

/** Key in `domainTypes` — any domain type, plain or Subject. */
export type DomainTypeRef = string;

/** Key in `domainTypes` that must have `resolverName` (a Subject). */
export type SubjectRef = string;

/** Key in `commands`. */
export type CommandRef = string;

/** Unqualified reference to a concrete Template: `"TemplateName"`. */
export type TemplateRef = string;

/** Qualified reference to a Strategy: `"TemplateName.StrategyName"`. */
export type StrategyRef = string;

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
 * framework. The Command's visit methods (one per Subject in the union)
 * are not declared here — they are derived from `subjectUnion` entries
 * and their `resolverName` values. The `dispatch` map specifies which
 * Template or Strategy each visit method resolves to.
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
 *                            entry requires a corresponding visit method
 *                            on the Command class, enforced at compile time
 *                            by `CommandSubjectStrategies<C>`.
 *
 * @property dispatch       — Maps each Subject to its resolution target.
 *                            Keys are Subject type references (must match
 *                            entries in `subjectUnion`). Values are either:
 *                            - `"TemplateName"` for concrete Templates
 *                              (those with `strategies: {}`)
 *                            - `"TemplateName.StrategyName"` for Strategies
 *                            The resolverName for each Subject key is derived
 *                            from the Subject's `resolverName` in `domainTypes`.
 *
 * @property templates      — All Templates (strategy implementations) for
 *                            this Command, keyed by class name. Each Template
 *                            declares its subject narrowing, hooks, and
 *                            nested Strategies. The Template's parent Command
 *                            is implicit from this nesting — no explicit
 *                            `commandRef` is needed.
 *
 *                            Dispatch targets reference these by name:
 *                            `"TemplateName"` for concrete Templates (those
 *                            with `strategies: {}`), or
 *                            `"TemplateName.StrategyName"` for a specific
 *                            Strategy within a Template.
 *
 *                            A Template with a non-empty `strategies` map
 *                            should be generated as an abstract class and
 *                            must not appear directly in `dispatch`. A
 *                            Template with `strategies: {}` is concrete
 *                            and may be referenced directly.
 */
/** A Command entry in the YAML config — declares generic params, dispatch map, and templates. */
export type Command = {
  commandName: string;
  baseType: DomainTypeRef;
  objectType: DomainTypeRef;
  returnType: DomainTypeRef;
  returnAsync?: boolean;
  subjectUnion: SubjectRef[];
  dispatch: {
    [subject: SubjectRef]: TemplateRef | StrategyRef;
  };
  templates: {
    [key: string]: Template;
  };
};

// ─── Template ────────────────────────────────────────────────────

/*
 * The strategy interface / abstract class.
 *
 * Maps to a class implementing `Template<C, H, SU>` in the framework.
 * A Template with a non-empty `strategies` map is abstract — it should
 * not be dispatched to directly. A Template with `strategies: {}` is
 * concrete and can serve as both the Template and the Strategy.
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
 * @property commandHooks   — Other Commands that the Template's `execute`
 *                            method may invoke during execution. Keys are
 *                            the property names on the Template class
 *                            (derived from the hook Command's `commandName`).
 *                            Values reference entries in `commands`.
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
 * @property strategies     — Concrete extensions of this Template. An empty
 *                            object (`{}`) means the Template is itself
 *                            concrete — it can be dispatched to directly.
 *                            A non-empty map means the Template is abstract
 *                            and only its Strategies should appear in
 *                            dispatch targets. Required — explicit emptiness
 *                            signals intent.
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
 * In dispatch references, Strategies use the dotted format:
 * `"TemplateName.StrategyName"`.
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
 *                            reference entries in `commands`.
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
 * @property namespace      — Optional namespace for the generated code.
 *                            May be used by codegen to scope imports,
 *                            file paths, or module names.
 *
 * @property imports        — External type-only imports needed by the
 *                            generated `domain-types.ts`. Maps module
 *                            specifiers to lists of type names. All
 *                            imports are emitted as `import type`.
 *
 *                            Use this when `domainTypes` field values
 *                            reference types that are not defined within
 *                            the same YAML (e.g. types from a schema
 *                            library or a third-party package):
 *
 *                            ```yaml
 *                            imports:
 *                              "ts-morph": [Project, SourceFile]
 *                              "../schema.js": [DomainType, Command]
 *                            ```
 *
 * @property externalTypes  — Types from other domains that are referenced
 *                            (e.g. in `subjectUnion`) but defined elsewhere.
 *                            Included in ConfigIndex for validation and
 *                            cross-reference checks; never emitted as code.
 *                            Use this for cross-domain Subject types that a
 *                            Command dispatches over but does not own.
 *
 * @property domainTypes    — All types in the domain, keyed by name.
 *                            Types with `resolverName` are Subjects; types
 *                            without are plain types (interfaces, result
 *                            types, context objects, base types).
 *
 * @property commands       — All Commands, keyed by class name. Each
 *                            Command declares its generic parameters, its
 *                            dispatch map, and its Templates (with nested
 *                            Strategies).
 */
/** Root schema for a codascon domain YAML config — declares namespace, imports, domain types, and commands. */
export interface YamlConfig {
  namespace?: string;
  imports?: {
    [moduleSpecifier: string]: string[];
  };
  externalTypes?: {
    [key: string]: DomainType;
  };
  domainTypes: {
    [key: string]: DomainType;
  };
  commands: {
    [key: string]: Command;
  };
}
