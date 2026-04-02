/**
 * Consumer type proofs — compiled by `tsc` against dist/index.d.ts via tsconfig.dist.json.
 * NOT run by vitest. Run with: pnpm typecheck:dist  (requires a prior pnpm build)
 *
 * §CP (positive): correct consumer patterns that MUST compile.
 *   A failing positive proof = a regression in the published API surface.
 *
 * §CN (negative): known limitations documented with @ts-expect-error.
 *   An unused @ts-expect-error directive = a limitation that no longer exists → remove it.
 */

import {
  Subject,
  Command,
  MiddlewareCommand,
  type Template,
  type MiddlewareTemplate,
  type Runnable,
  type SubjectResolverName,
  type CommandName,
  type CommandObject,
  type CommandReturn,
  type CommandBase,
  type CommandSubjectUnion,
  type CommandBSL,
} from "codascon";

// ─── Type assertion helpers ──────────────────────────────────────────────────

type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// ─── Consumer domain ─────────────────────────────────────────────────────────

class User extends Subject {
  readonly resolverName = "resolveUser" as const;
  constructor(public readonly id: string) {
    super();
  }
}

class Admin extends Subject {
  readonly resolverName = "resolveAdmin" as const;
  constructor(public readonly id: string) {
    super();
  }
}

interface Ctx {
  path: string;
}
interface Res {
  status: number;
  body: unknown;
}

// ─── §CP1: Runnable ──────────────────────────────────────────────────────────

const _cp1: Runnable<User | Admin, Ctx, Res> = {
  run: (_subject, _ctx) => ({ status: 200, body: null }),
};

// ─── §CP2: SubjectResolverName ───────────────────────────────────────────────

type _CP2a = Expect<Equal<SubjectResolverName<User>, "resolveUser">>;
type _CP2b = Expect<Equal<SubjectResolverName<Admin>, "resolveAdmin">>;

// ─── §CP3–§CP8: Command type utility extraction ───────────────────────────────

class HandleRequest extends Command<object, Ctx, Res, [User, Admin]> {
  readonly commandName = "handleRequest" as const;
  resolveUser(_u: User, _c: Readonly<Ctx>): Template<HandleRequest, [], User> {
    return { execute: (_s, _o) => ({ status: 200, body: "user" }) };
  }
  resolveAdmin(_a: Admin, _c: Readonly<Ctx>): Template<HandleRequest, [], Admin> {
    return { execute: (_s, _o) => ({ status: 200, body: "admin" }) };
  }
}

type _CP3 = Expect<Equal<CommandName<HandleRequest>, "handleRequest">>;
type _CP4 = Expect<Equal<CommandObject<HandleRequest>, Ctx>>;
type _CP5 = Expect<Equal<CommandReturn<HandleRequest>, Res>>;
type _CP6 = Expect<Equal<CommandBase<HandleRequest>, object>>;
type _CP7 = Expect<Equal<CommandSubjectUnion<HandleRequest>, User | Admin>>;
type _CP8 = Expect<Equal<CommandBSL<HandleRequest>, [User, Admin]>>;

// ─── §CP9: CommandSubjectUnion as direct execute param (not generic constraint) ──

/* Using CommandSubjectUnion<C> as a direct annotation resolves eagerly to the union.
   The generic constraint form (<T extends CommandSubjectUnion<C>>) is deferred and must
   not be used — accessing subject members through T fails. */
const _cp9: Template<HandleRequest, [], User | Admin> = {
  execute(subject: CommandSubjectUnion<HandleRequest>, _ctx: Ctx): Res {
    return { status: 200, body: subject.resolverName };
  },
};

// ─── §CP10: Template in implements clause with hooks ─────────────────────────

class LogCommand extends Command<object, unknown, void, [User, Admin]> {
  readonly commandName = "log" as const;
  resolveUser(_u: User, _c: Readonly<unknown>): Template<LogCommand, [], User> {
    return { execute: () => undefined };
  }
  resolveAdmin(_a: Admin, _c: Readonly<unknown>): Template<LogCommand, [], Admin> {
    return { execute: () => undefined };
  }
}

abstract class AuditedTemplate<SU extends User | Admin> implements Template<
  HandleRequest,
  [LogCommand],
  SU
> {
  readonly log = new LogCommand();
  abstract execute(subject: SU, ctx: Ctx): Res;
}

class _AuditedUserHandler extends AuditedTemplate<User> {
  execute(_u: User, _ctx: Ctx): Res {
    this.log.run(_u, {});
    return { status: 200, body: "audited user" };
  }
}

// ─── §CP11: MiddlewareTemplate as resolver return type annotation ─────────────

/* Annotating a resolver's return type with MiddlewareTemplate<C, H, SU> is safe —
   the circularity issue (§CN1) only occurs when C is the *same* class that declares
   defaultResolver. Here C = AuthnMiddleware and the annotation is on its own resolver
   return type, not on defaultResolver. */

class AuthnMiddleware extends MiddlewareCommand<object, Ctx, Res, [User, Admin]> {
  readonly commandName = "authn" as const;
  resolveUser(_u: User, _c: Readonly<Ctx>): MiddlewareTemplate<AuthnMiddleware, [], User> {
    return {
      execute: <T extends User>(_s: T, _o: Ctx, inner?: Runnable<T, Ctx, Res>) =>
        inner!.run(_s, _o),
    };
  }
  resolveAdmin(_a: Admin, _c: Readonly<Ctx>): MiddlewareTemplate<AuthnMiddleware, [], Admin> {
    return {
      execute: <T extends Admin>(_s: T, _o: Ctx, inner?: Runnable<T, Ctx, Res>) =>
        inner!.run(_s, _o),
    };
  }
}

// ─── §CP12: MiddlewareCommand subclass assigned to Command.middleware ─────────

/* Subclassing MiddlewareCommand and assigning the instance to Command.middleware[]
   must compile. Two patterns exercised: resolver methods (AuthnMiddleware from §CP11)
   and defaultResolver (AuthnMiddlewareDefault from §CP13, defined below). */

class _HandleRequestWithMiddleware extends Command<object, Ctx, Res, [User, Admin]> {
  readonly commandName = "handleRequestWithMiddleware" as const;
  private readonly mw = new AuthnMiddleware();
  override get middleware() {
    return [this.mw];
  }
  resolveUser(_u: User, _c: Readonly<Ctx>): Template<_HandleRequestWithMiddleware, [], User> {
    return { execute: (_s, _o) => ({ status: 200, body: "user" }) };
  }
  resolveAdmin(_a: Admin, _c: Readonly<Ctx>): Template<_HandleRequestWithMiddleware, [], Admin> {
    return { execute: (_s, _o) => ({ status: 200, body: "admin" }) };
  }
}

// ─── §CP13: MiddlewareCommand defaultResolver without annotation (inference) ──

/* Correct pattern: let TypeScript infer the type of defaultResolver from the object
   literal. The inferred type satisfies MiddlewareTemplate<C, [], SU> structurally.
   execute must be generic (<T extends SU>) to match the required shape. */

class _AuthnMiddlewareDefault extends MiddlewareCommand<object, Ctx, Res, [User, Admin]> {
  readonly commandName = "authnDefault" as const;
  override readonly defaultResolver = {
    execute: <T extends User | Admin>(_s: T, _o: Ctx, inner: Runnable<T, Ctx, Res>) =>
      inner.run(_s, _o),
  };
}

// ─── §CP14: MiddlewareTemplate as defaultResolver annotation ─────────────────
/*
 * Previously §CN1 — was a TS2589 failure before the phantom _o/_r fix.
 *
 * MiddlewareTemplate<C, H, SU> expands through CommandObject<C> and CommandReturn<C>.
 * Before the fix those used heritage-clause structural matching, which inspected C's
 * members — including defaultResolver itself — creating a circular evaluation.
 * After the fix CommandObject/CommandReturn use phantom property lookup (_o, _r),
 * which reads the type directly without traversing other members. Cycle broken.
 */

class _AuthnMiddlewareAnnotated extends MiddlewareCommand<object, Ctx, Res, [User, Admin]> {
  readonly commandName = "authnAnnotated" as const;
  override readonly defaultResolver: MiddlewareTemplate<
    _AuthnMiddlewareAnnotated,
    [],
    User | Admin
  > = {
    execute: <T extends User | Admin>(_s: T, _o: Ctx, inner: Runnable<T, Ctx, Res>) =>
      inner.run(_s, _o),
  };
}

// ─── §CP15: Template as Command.defaultResolver annotation ───────────────────
/*
 * Same fix applies to regular Commands: Template<C, H, SU> as a defaultResolver
 * annotation previously caused TS2589 for the same reason. Now compiles cleanly.
 */

class _HandleRequestWithDefault extends Command<object, Ctx, Res, [User, Admin]> {
  readonly commandName = "handleRequestWithDefault" as const;
  override readonly defaultResolver: Template<_HandleRequestWithDefault, [], User | Admin> = {
    execute: (_s: User | Admin, _o: Ctx): Res => ({ status: 200, body: "default" }),
  };
}
