import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './test-utils/load-typescript-module.mjs';

const records = loadTypeScriptModule('lib/account-records.ts');
const start = '2026-10-27T01:15:00.000Z';
const end = '2026-10-27T02:00:00.000Z';

function useDatabase(t, handler) {
  const previous = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://database.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-test-key';
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [['SUPABASE_URL', previous.url], ['SUPABASE_SERVICE_ROLE_KEY', previous.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test('availability queries overlaps, including a running booking that started before the window', async t => {
  const session = { id: 63, robot_model: 'Master', scheduled_start: '2026-10-27T01:00:46Z',
    scheduled_end: '2026-10-27T01:20:46Z', session_status: 'running' };
  let query;
  useDatabase(t, async url => {
    query = new URL(url).searchParams;
    return new Response(JSON.stringify([session]));
  });
  const rows = await records.getRobotSessionsInWindow(start, end);
  assert.equal(query.get('scheduled_end'), 'gt.2026-10-27T01:15:00.000Z');
  assert.deepEqual(query.getAll('scheduled_start'), ['lt.2026-10-27T02:00:00.000Z']);
  assert.equal(rows[0].id, 63);
});

test('availability database failures are not presented as an empty free schedule', async t => {
  useDatabase(t, async () => new Response('database unavailable', { status: 503 }));
  await assert.rejects(() => records.getRobotSessionsInWindow(start, end), /database unavailable/);
});

test('reservation conflict lookup fails closed when the database cannot be checked', async t => {
  useDatabase(t, async () => new Response('database unavailable', { status: 503 }));
  await assert.rejects(() => records.findRobotSessionConflict(start, end), /database unavailable/);
});

test('another robot still reserves the single shared cell; touching endpoints do not overlap', async t => {
  useDatabase(t, async () => new Response(JSON.stringify([
    { id: 60, robot_model: 'Master', scheduled_start: '2026-10-27T01:00:00Z', scheduled_end: start, session_status: 'running' },
    { id: 61, robot_model: 'Navi', scheduled_start: start, scheduled_end: end, session_status: 'cancelled' },
    { id: 62, robot_model: 'Master', scheduled_start: end, scheduled_end: '2026-10-27T02:05:00Z', session_status: 'requested' },
    { id: 63, robot_model: 'Master', scheduled_start: '2026-10-27T01:00:46Z', scheduled_end: '2026-10-27T01:20:46Z', session_status: 'running' },
  ])));
  assert.equal((await records.findRobotSessionConflict(start, end)).id, 63);
});
