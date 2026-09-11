import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});
const {
  applyEaisProjectMutation,
  listEaisProjects,
  validateEaisProjectMutation
} = await import("../lib/eais-projects.ts");

const identity = {
  userId: "8f138742-102c-4bc7-a4d7-b86dbe9b4252",
  email: "owner@example.com"
};
const projectId = "b44cbb4a-caa4-4448-8a94-34f213f540e8";
const mutationId = "ee383fe3-d643-4769-89da-a1f2af91d49a";

test.beforeEach((t) => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = "https://projects-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  t.after(() => { process.env = saved; });
});

test("project listing always filters by the signed stable owner", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/rest/v1/agentech_projects");
    assert.equal(parsed.searchParams.get("owner_user_id"), `eq.${identity.userId}`);
    assert.equal(parsed.searchParams.get("deleted_at"), "is.null");
    assert.match(init.headers.Authorization, /^Bearer test-only-service-key$/);
    return Response.json([]);
  });
  assert.deepEqual(await listEaisProjects(identity), []);
});

test("a project mutation sends only the server identity as owner and carries its idempotency key", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(url).pathname, "/rest/v1/rpc/agentech_apply_project_mutation");
    body = JSON.parse(init.body);
    return Response.json({
      kind: "applied",
      revision: 1,
      replayed: false,
      project: {
        id: projectId,
        owner_user_id: identity.userId,
        title: "Persistent robot",
        category: "Humanoid",
        description: "Saved privately.",
        cover_object_path: null,
        draft: {},
        progress: {},
        revision: 1,
        created_at: "2026-09-11T00:00:00.000Z",
        updated_at: "2026-09-11T00:00:00.000Z",
        deleted_at: null
      }
    });
  });
  const result = await applyEaisProjectMutation(identity, {
    projectId,
    mutationId,
    action: "create",
    expectedRevision: 0,
    title: " Persistent robot ",
    category: "Humanoid",
    description: " Saved privately. ",
    draft: {},
    progress: {},
    owner_user_id: "f09fe339-02a9-4d8a-90a6-250dccd5dcb3"
  });
  assert.equal(result.kind, "applied");
  assert.equal(body.p_owner_user_id, identity.userId);
  assert.equal(body.p_mutation_id, mutationId);
  assert.equal(body.p_title, "Persistent robot");
  assert.equal("owner_user_id" in body, false);
});

test("drafts and progress reject arrays, oversize objects, and invalid revisions", () => {
  assert.throws(() => validateEaisProjectMutation({
    projectId,
    mutationId,
    action: "update",
    expectedRevision: 1,
    draft: []
  }), /JSON object/);
  assert.throws(() => validateEaisProjectMutation({
    projectId,
    mutationId,
    action: "update",
    expectedRevision: 1,
    progress: { payload: "x".repeat(70 * 1024) }
  }), /64 KB/);
  assert.throws(() => validateEaisProjectMutation({
    projectId,
    mutationId,
    action: "delete",
    expectedRevision: -1
  }), /nonnegative integer/);
});
