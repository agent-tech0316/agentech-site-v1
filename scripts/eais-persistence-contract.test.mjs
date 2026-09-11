import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the additive migration maps provider identity and defines private idempotent project storage", async () => {
  const migration = await source("supabase/migrations/202609110100_eais_identity_persistence.sql");

  assert.match(migration, /agentech_accounts[\s\S]*auth_user_id uuid/);
  assert.match(migration, /references auth\.users\s*\(id\)/i);
  assert.match(migration, /create table if not exists public\.agentech_projects/);
  assert.match(migration, /owner_user_id uuid not null/);
  assert.match(migration, /create table if not exists public\.agentech_project_edits/);
  assert.match(migration, /mutation_id uuid not null/);
  assert.match(migration, /unique[\s\S]*owner_user_id[\s\S]*mutation_id/i);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /grant execute on function public\.agentech_apply_project_mutation\([^;]+to service_role;/i);
  assert.doesNotMatch(migration, /grant execute on function public\.agentech_apply_project_mutation\([^;]+to authenticated;/i);
  assert.match(migration, /prior_project_id <> p_project_id/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /result_project jsonb not null/);
});
test("auth routes use provider UUID sessions and never write a second password hash", async () => {
  const [signIn, createAccount, reset, admin] = await Promise.all([
    source("app/api/auth/sign-in/route.ts"),
    source("app/api/auth/create-account/route.ts"),
    source("app/api/auth/reset-password/route.ts"),
    source("lib/supabase-auth-admin.ts")
  ]);

  assert.match(signIn, /userId/);
  assert.match(createAccount, /userId/);
  assert.match(reset, /updateSupabaseAuthPassword/);
  for (const route of [signIn, createAccount, reset]) {
    assert.doesNotMatch(route, /createPasswordHash|updateAccountPassword/);
  }
  assert.doesNotMatch(admin, /body: JSON\.stringify\(\{ password, email_confirm: true \}\)[\s\S]*method: "PUT"/);
});

test("private project APIs derive ownership from the verified server identity", async () => {
  const [collection, member, records] = await Promise.all([
    source("app/api/eais/projects/route.ts"),
    source("app/api/eais/projects/[id]/route.ts"),
    source("lib/eais-projects.ts")
  ]);

  for (const route of [collection, member]) {
    assert.match(route, /getServerAccountIdentity/);
    assert.match(route, /allowLegacyCookie: false/);
    assert.doesNotMatch(route, /payload\?\.owner|payload\.owner|searchParams\.get\("email"\)/);
  }
  assert.match(records, /owner_user_id=eq\./);
  assert.match(records, /rpc\/agentech_apply_project_mutation/);
});

test("My Works consumes persistent private APIs while local preview remains isolated", async () => {
  const component = await source("components/my-works.tsx");
  assert.match(component, /fetch\("\/api\/eais\/projects"/);
  assert.match(component, /localPreview/);
  assert.match(component, /Saved privately to your account/);
  assert.match(component, /Restored from your account/);
});
