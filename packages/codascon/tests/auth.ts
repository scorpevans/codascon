/**
 * auth.check.ts — codascon middleware: authentication + authorization
 *
 * Demonstrates layered middleware using two MiddlewareCommands:
 *
 *   1. AuthnMiddleware — verifies the bearer token (uses defaultResolver:
 *      authentication is subject-agnostic; one declaration covers all subjects).
 *   2. AuthzMiddleware — enforces per-endpoint role requirements (uses specific
 *      resolver methods: authorization is subject-specific; exhaustiveness is
 *      enforced by the compiler — adding a new endpoint Subject without updating
 *      AuthzMiddleware is a compile error).
 *
 * Chain (outermost → innermost → core):
 *   [AuthnMiddleware, AuthzMiddleware] → HandleRequestCommand
 *
 * Short-circuit contract:
 *   - AuthnMiddleware returns 401 without calling inner.run() when token is invalid.
 *   - AuthzMiddleware returns 403 without calling inner.run() when roles are insufficient.
 *   - Only when both pass does HandleRequestCommand's resolver run.
 */

// Consumer import — resolves to dist/index.d.ts via tsconfig.dist.json paths.
import {
  Command,
  Subject,
  MiddlewareCommand,
  type Template,
  type MiddlewareTemplate,
  type Runnable,
} from "codascon";

// ─── Domain: API endpoint subjects ─────────────────────────────────────────

/** Accessible to any authenticated user. */
class PublicEndpoint extends Subject {
  readonly resolverName = "resolvePublicEndpoint" as const;
  constructor(public readonly path: string) {
    super();
  }
}

/** Requires the caller to hold at least the "user" role. */
class ProtectedEndpoint extends Subject {
  readonly resolverName = "resolveProtectedEndpoint" as const;
  constructor(public readonly path: string) {
    super();
  }
}

/** Requires the caller to hold the "admin" role. */
class AdminEndpoint extends Subject {
  readonly resolverName = "resolveAdminEndpoint" as const;
  constructor(public readonly path: string) {
    super();
  }
}

type Endpoint = PublicEndpoint | ProtectedEndpoint | AdminEndpoint;

// ─── Context and return types ───────────────────────────────────────────────

interface ApiRequest {
  /** Bearer token supplied by the caller. */
  token?: string;
  /** Populated by AuthnMiddleware after token validation. */
  user?: { id: string; roles: string[] };
}

interface ApiResponse {
  status: number;
  body: unknown;
}

// ─── Mock token store ───────────────────────────────────────────────────────

/* In production this would be a JWT verifier or an auth-service call. */
const TOKEN_DB: Record<string, { id: string; roles: string[] }> = {
  "token-alice": { id: "alice", roles: ["user"] },
  "token-bob": { id: "bob", roles: ["user", "admin"] },
};

// ─── Middleware 1: Authentication ───────────────────────────────────────────
//
// Authentication is subject-agnostic: the same token-check logic applies
// regardless of which endpoint is being accessed. defaultResolver is the
// right fit — one declaration covers all subjects, no per-subject duplication.

class AuthnMiddleware extends MiddlewareCommand<
  object,
  ApiRequest,
  ApiResponse,
  [PublicEndpoint, ProtectedEndpoint, AdminEndpoint]
> {
  readonly commandName = "authn" as const;

  /**
   * Validates the bearer token and enriches the request context with the
   * resolved user identity. Short-circuits with 401 if token is absent or
   * unknown — inner.run() is never called, stopping the chain immediately.
   */
  readonly defaultResolver = {
    execute<T extends Endpoint>(
      subject: T,
      request: ApiRequest,
      inner: Runnable<T, ApiRequest, ApiResponse>,
    ): ApiResponse {
      const user = request.token ? TOKEN_DB[request.token] : undefined;
      if (!user) {
        return { status: 401, body: "Unauthorized: invalid or missing token" };
      }
      // Enrich the request with the resolved identity before passing down the chain.
      return inner.run(subject, { ...request, user });
    },
  };
}

// ─── Middleware 2: Authorization ────────────────────────────────────────────
//
// Authorization is subject-specific: each endpoint type has its own role
// requirement. Specific resolver methods let the compiler enforce exhaustiveness —
// adding a new endpoint Subject without a corresponding resolver here is a
// compile error on HandleRequestCommand.run().

class AuthzMiddleware extends MiddlewareCommand<
  object,
  ApiRequest,
  ApiResponse,
  [PublicEndpoint, ProtectedEndpoint, AdminEndpoint]
> {
  readonly commandName = "authz" as const;

  /** Public endpoints: any authenticated caller may proceed. */
  resolvePublicEndpoint(
    _s: PublicEndpoint,
    _req: Readonly<ApiRequest>,
  ): MiddlewareTemplate<AuthzMiddleware, [], PublicEndpoint> {
    return {
      execute<T extends PublicEndpoint>(
        s: T,
        req: ApiRequest,
        inner: Runnable<T, ApiRequest, ApiResponse>,
      ): ApiResponse {
        return inner.run(s, req);
      },
    };
  }

  /** Protected endpoints: caller must hold the "user" or "admin" role. */
  resolveProtectedEndpoint(
    _s: ProtectedEndpoint,
    _req: Readonly<ApiRequest>,
  ): MiddlewareTemplate<AuthzMiddleware, [], ProtectedEndpoint> {
    return {
      execute<T extends ProtectedEndpoint>(
        s: T,
        req: ApiRequest,
        inner: Runnable<T, ApiRequest, ApiResponse>,
      ): ApiResponse {
        const roles = req.user?.roles ?? [];
        if (!roles.includes("user") && !roles.includes("admin")) {
          return { status: 403, body: "Forbidden: requires 'user' role" };
        }
        return inner.run(s, req);
      },
    };
  }

  /** Admin endpoints: caller must hold the "admin" role. */
  resolveAdminEndpoint(
    _s: AdminEndpoint,
    _req: Readonly<ApiRequest>,
  ): MiddlewareTemplate<AuthzMiddleware, [], AdminEndpoint> {
    return {
      execute<T extends AdminEndpoint>(
        s: T,
        req: ApiRequest,
        inner: Runnable<T, ApiRequest, ApiResponse>,
      ): ApiResponse {
        const roles = req.user?.roles ?? [];
        if (!roles.includes("admin")) {
          return { status: 403, body: "Forbidden: requires 'admin' role" };
        }
        return inner.run(s, req);
      },
    };
  }
}

// ─── Core command: request handler ─────────────────────────────────────────

class HandleRequestCommand extends Command<
  object,
  ApiRequest,
  ApiResponse,
  [PublicEndpoint, ProtectedEndpoint, AdminEndpoint]
> {
  readonly commandName = "handleRequest" as const;

  private readonly authn = new AuthnMiddleware();
  private readonly authz = new AuthzMiddleware();

  override get middleware(): [AuthnMiddleware, AuthzMiddleware] {
    return [this.authn, this.authz];
  }

  resolvePublicEndpoint(
    s: PublicEndpoint,
    _req: Readonly<ApiRequest>,
  ): Template<HandleRequestCommand, [], PublicEndpoint> {
    return {
      execute: (_s: PublicEndpoint, _req: ApiRequest): ApiResponse => ({
        status: 200,
        body: { message: `Public content at ${s.path}` },
      }),
    };
  }

  resolveProtectedEndpoint(
    s: ProtectedEndpoint,
    _req: Readonly<ApiRequest>,
  ): Template<HandleRequestCommand, [], ProtectedEndpoint> {
    return {
      execute: (_s: ProtectedEndpoint, req: ApiRequest): ApiResponse => ({
        status: 200,
        body: { message: `Protected content at ${s.path}`, user: req.user?.id },
      }),
    };
  }

  resolveAdminEndpoint(
    s: AdminEndpoint,
    _req: Readonly<ApiRequest>,
  ): Template<HandleRequestCommand, [], AdminEndpoint> {
    return {
      execute: (_s: AdminEndpoint, req: ApiRequest): ApiResponse => ({
        status: 200,
        body: { message: `Admin panel at ${s.path}`, operator: req.user?.id },
      }),
    };
  }
}

// ─── Demo ───────────────────────────────────────────────────────────────────

const api = new HandleRequestCommand();

const publicPage = new PublicEndpoint("/blog/hello-world");
const dashboard = new ProtectedEndpoint("/dashboard");
const adminPanel = new AdminEndpoint("/admin/users");

// ❌ No token — authn short-circuits
console.log(api.run(publicPage, {}));
// { status: 401, body: 'Unauthorized: invalid or missing token' }

// ❌ Alice (user role) → admin endpoint — authz short-circuits
console.log(api.run(adminPanel, { token: "token-alice" }));
// { status: 403, body: "Forbidden: requires 'admin' role" }

// ✅ Alice → protected endpoint — both layers pass
console.log(api.run(dashboard, { token: "token-alice" }));
// { status: 200, body: { message: 'Protected content at /dashboard', user: 'alice' } }

// ✅ Bob (admin role) → admin endpoint — both layers pass
console.log(api.run(adminPanel, { token: "token-bob" }));
// { status: 200, body: { message: 'Admin panel at /admin/users', operator: 'bob' } }
