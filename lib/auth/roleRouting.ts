/**
 * Single source of truth for role-based routing decisions.
 *
 * IMPORTANT: This module intentionally has NO ambiguous fallback that turns an
 * unknown/missing role into an administrative role. If the role cannot be
 * confidently classified as "cliente" or as one of the administrative roles,
 * the caller must treat it as an INCOMPLETE profile state and route to
 * `/perfil-pendiente` — never to the admin panel ("/").
 *
 * middleware.ts, app/login/page.tsx, components/layout/AppShell.tsx and
 * app/mi-panel/page.tsx all import from here so the redirect decision can
 * never drift between the different places that used to duplicate it.
 */

export const ADMIN_ROLES = ["owner", "admin", "staff"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const CLIENT_ROLE = "cliente" as const;
export type KnownRole = AdminRole | typeof CLIENT_ROLE;

export const ADMIN_HOME = "/" as const;
export const CLIENT_HOME = "/mi-panel" as const;
export const INCOMPLETE_PROFILE_ROUTE = "/perfil-pendiente" as const;

/** True only for the exact set of roles the system currently understands. */
export function isKnownRole(role: string | null | undefined): role is KnownRole {
  if (!role) return false;
  return role === CLIENT_ROLE || (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isClientRole(role: string | null | undefined): boolean {
  return role === CLIENT_ROLE;
}

/**
 * Resolves the destination route for an authenticated user based ONLY on
 * `profiles.role`. Never guess, never default unknown roles to admin.
 *
 *   role === 'cliente'                -> /mi-panel
 *   role in (owner, admin, staff)     -> /
 *   role missing / null / unrecognized -> /perfil-pendiente (controlled, non-admin)
 */
export function homeForRole(
  role: string | null | undefined,
): typeof ADMIN_HOME | typeof CLIENT_HOME | typeof INCOMPLETE_PROFILE_ROUTE {
  if (isClientRole(role)) return CLIENT_HOME;
  if (isAdminRole(role)) return ADMIN_HOME;
  return INCOMPLETE_PROFILE_ROUTE;
}
