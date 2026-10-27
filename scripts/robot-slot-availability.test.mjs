import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { loadTypeScriptModule } from './test-utils/load-typescript-module.mjs';

// Execute the production availability effect with controlled network/state
// boundaries. React rendering is not needed to observe whether slots open.
const source = fs.readFileSync('components/account-dashboard.tsx', 'utf8');
const ast = ts.createSourceFile('dashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('/api/robot-slot?start=')) {
    effect = node.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, 'production availability effect exists');
const compiled = ts.transpileModule(`return (${effect})();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

async function availability(fetch) {
  const candidates = [{ value: '2026-10-27T01:15:00Z', label: '6:15 PM', disabled: false }];
  const state = { options: candidates, error: '', loading: false };
  let finished;
  const done = new Promise(resolve => { finished = resolve; });
  const bindings = {
    email: 'offline@example.test', data: { accessProfiles: [{ id: 1 }] },
    robotSlotDurationMinutes: '5', robotSlotStart: candidates[0].value,
    generateRobotSlotCandidates: () => candidates, isAgentechCompanyEmail: () => false,
    setRobotSlotOptions: value => { state.options = value; },
    setLoadingRobotSlots: value => { state.loading = value; if (!value) finished(); },
    setRobotSlotAvailabilityError: value => { state.error = value; },
    setRobotSlotStart: () => {}, fetch,
  };
  new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
  await done;
  return state;
}

for (const [name, response] of [
  ['HTTP failure', () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })],
  ['missing bookedSlots', () => new Response(JSON.stringify({ ok: true }))],
  ['network failure', () => { throw new Error('offline'); }],
  ['invalid JSON', () => new Response('not json')],
]) {
  test(`availability ${name} never presents candidate slots as free`, async () => {
    const state = await availability(async () => response());
    assert.deepEqual(state.options, []);
    assert.match(state.error, /availability|available/i);
    assert.equal(state.loading, false);
  });
}

test('successful availability retains the overlapping-slot disabled state', async () => {
  const state = await availability(async () => new Response(JSON.stringify({ ok: true, bookedSlots: [
    { scheduledStart: '2026-10-27T01:10:00Z', scheduledEnd: '2026-10-27T01:16:00Z' },
  ] })));
  assert.equal(state.options[0].disabled, true);
  assert.equal(state.error, '');
});

test('availability API returns safe JSON503 rather than exposing a database failure', async t => {
  const prior = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://database.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-test-key';
  globalThis.fetch = async () => new Response('private database diagnostic', { status: 503 });
  t.after(() => {
    globalThis.fetch = prior.fetch;
    for (const [key, value] of [['SUPABASE_URL', prior.url], ['SUPABASE_SERVICE_ROLE_KEY', prior.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const route = loadTypeScriptModule('app/api/robot-slot/route.ts');
  const response = await route.GET(new Request('http://localhost/api/robot-slot?start=2026-10-27T01:15:00Z&end=2026-10-27T02:00:00Z'));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
  assert.doesNotMatch(JSON.stringify(body), /private database diagnostic/);
});

test('reservation conflict-read failure returns JSON503 before charging or reserving', async () => {
  const nativeRequire = createRequire(import.meta.url);
  const routeSource = fs.readFileSync('app/api/robot-slot/route.ts', 'utf8');
  const output = ts.transpileModule(routeSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const writes = [];
  let conflictReads = 0;
  const email = 'offline@example.test';
  const records = {
    getAccountRecord: async () => ({ developer_latest_code_submission_id: 'approved-test' }),
    allocateCreditSpend: () => ({ rechargeRequired: false }),
    getAccessProfiles: async () => [{ id: 1, username: 'offline', profile_type: 'developer' }],
    getCodeSubmissionRecord: async () => ({ robot_model: 'Navi', physical_safety_status: 'passed', ai_security_status: 'passed' }),
    findRobotSessionConflict: async () => { conflictReads++; throw new Error('private database diagnostic'); },
    spendAccountCredits: async () => { writes.push('charge'); },
    createRobotSession: async () => { writes.push('reserve'); },
  };
  const require = name => {
    if (name === '@/lib/account-records') return records;
    if (name === '@/lib/server-account-session') return { getServerAccountEmail: async () => email };
    if (name === '@/lib/company-accounts') return { isAgentechCompanyEmail: () => false };
    if (name.startsWith('@/')) return loadTypeScriptModule(`${name.slice(2)}.ts`);
    return nativeRequire(name);
  };
  const exports = {};
  new Function('exports', 'require', output)(exports, require);
  const response = await exports.POST(new Request('http://localhost/api/robot-slot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, profileId: 1, scheduledStart: '2099-10-27T16:00:00Z',
      timeZone: 'America/Los_Angeles', robotModel: 'Navi', durationMinutes: 5 }),
  }));
  assert.equal(conflictReads, 1);
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private database diagnostic/);
  assert.deepEqual(writes, []);
});
