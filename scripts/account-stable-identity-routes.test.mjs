import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("account mutations use the signed stable user identity instead of client-supplied email", async () => {
  const [session, account, profile, child, education] = await Promise.all([
    source("lib/server-account-session.ts"),
    source("app/api/account/route.ts"),
    source("app/api/account-profile/route.ts"),
    source("app/api/account-child/route.ts"),
    source("app/api/education-account/route.ts")
  ]);

  assert.match(session, /options\.allowLegacyCookie \?\? process\.env\.NODE_ENV !== "production"/);
  assert.match(session, /userId:/);
  for (const route of [account, profile, child, education]) {
    assert.match(route, /getServerAccountIdentity\(request, \{ allowLegacyCookie: false \}\)/);
    assert.doesNotMatch(route, /normalizeEmail\(payload\?\.email\)|normalizeEmail\(payload\.email\)/);
  }
});

test("sign out expires the signed HttpOnly session before clearing browser account state", async () => {
  const [serverSession, route, clientSession, gateway, account, header, authForm] = await Promise.all([
    source("lib/server-account-session.ts"),
    source("app/api/auth/sign-out/route.ts"),
    source("lib/account-session.ts"),
    source("components/ai-gateway-admin-dashboard.tsx"),
    source("components/account-dashboard.tsx"),
    source("components/site-header.tsx"),
    source("components/universal-auth-form.tsx")
  ]);

  assert.match(serverSession, /clearSignedAccountSessionCookie/);
  assert.match(serverSession, /name: signedAccountSessionCookieName[\s\S]{0,180}maxAge: 0/);
  assert.match(route, /clearSignedAccountSessionCookie\(response\)/);
  assert.match(clientSession, /fetch\("\/api\/auth\/sign-out", \{[\s\S]{0,100}method: "POST"/);
  assert.match(clientSession, /await response\.json\(\)\.catch/);
  assert.match(clientSession, /clearAccountSession\(\)/);
  assert.match(gateway, /await signOutAccountSession\(\)/);
  assert.match(account, /await signOutAccountSession\(\)/);
  assert.doesNotMatch(account, /clearAccountSession\(\)/);
  for (const client of [header, authForm]) {
    assert.match(client, /await signOutAccountSession\(\)/);
    assert.doesNotMatch(client, /clearAccountSession\(\)/);
  }
});
