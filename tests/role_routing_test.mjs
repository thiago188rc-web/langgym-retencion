// Unit tests for lib/auth/roleRouting.ts — the single source of truth for
// role-based redirect decisions used by middleware.ts, app/login/page.tsx,
// components/layout/AppShell.tsx and app/mi-panel/page.tsx.
//
// Run with: node --test tests/role_routing_test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  homeForRole,
  isKnownRole,
  isAdminRole,
  isClientRole,
  ADMIN_HOME,
  CLIENT_HOME,
  INCOMPLETE_PROFILE_ROUTE,
} from "../lib/auth/roleRouting.ts";

test("cliente role routes to /mi-panel", () => {
  assert.equal(homeForRole("cliente"), CLIENT_HOME);
});

test("owner/admin/staff route to admin home (/)", () => {
  assert.equal(homeForRole("owner"), ADMIN_HOME);
  assert.equal(homeForRole("admin"), ADMIN_HOME);
  assert.equal(homeForRole("staff"), ADMIN_HOME);
});

test("missing role (null/undefined) NEVER routes to admin home", () => {
  assert.equal(homeForRole(null), INCOMPLETE_PROFILE_ROUTE);
  assert.equal(homeForRole(undefined), INCOMPLETE_PROFILE_ROUTE);
  assert.notEqual(homeForRole(null), ADMIN_HOME);
  assert.notEqual(homeForRole(undefined), ADMIN_HOME);
});

test("empty string / unrecognized role never routes to admin home", () => {
  assert.equal(homeForRole(""), INCOMPLETE_PROFILE_ROUTE);
  assert.equal(homeForRole("superadmin"), INCOMPLETE_PROFILE_ROUTE);
  assert.equal(homeForRole("Cliente"), INCOMPLETE_PROFILE_ROUTE); // case sensitive on purpose
  assert.equal(homeForRole("null"), INCOMPLETE_PROFILE_ROUTE);
});

test("isKnownRole / isAdminRole / isClientRole classify correctly", () => {
  assert.equal(isKnownRole("cliente"), true);
  assert.equal(isKnownRole("owner"), true);
  assert.equal(isKnownRole("staff"), true);
  assert.equal(isKnownRole(null), false);
  assert.equal(isKnownRole(undefined), false);
  assert.equal(isKnownRole(""), false);
  assert.equal(isKnownRole("random"), false);

  assert.equal(isAdminRole("owner"), true);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("staff"), true);
  assert.equal(isAdminRole("cliente"), false);
  assert.equal(isAdminRole(null), false);

  assert.equal(isClientRole("cliente"), true);
  assert.equal(isClientRole("owner"), false);
  assert.equal(isClientRole(null), false);
});
