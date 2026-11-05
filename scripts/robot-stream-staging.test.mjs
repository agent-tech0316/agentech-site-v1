import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { writeReviewedSource } from './robot-stream-staging.mjs';
import { activeCameraStreamDeadline } from './robot-stream-session-policy.mjs';

test('a failed compilation can retry identical reviewed source without overwriting changed source', t => {
  const root = mkdtempSync(join(tmpdir(), 'eaic-staging-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'session-94.reviewed.py');
  const code = 'from agentech import Agentech\nAgentech.turn_head()';
  writeReviewedSource(file, code);
  writeReviewedSource(file, code);
  assert.equal(readFileSync(file, 'utf8'), code);
  assert.throws(() => writeReviewedSource(file, code + '\nAgentech.shake_head(5, 2)'), /differs/);
  assert.equal(readFileSync(file, 'utf8'), code);
  assert.throws(() => writeReviewedSource(join(root, 'missing', 'file.py'), code), /ENOENT/);
});

const now = Date.parse('2026-11-05T10:00:00Z');
const booking = changes => ({ id: 94, approved_run_type: 'custom_code', session_status: 'approved',
  scheduled_start: new Date(now - 60000).toISOString(), scheduled_end: new Date(now + 60000).toISOString(), ...changes });

test('camera-only delivery is bounded by a current approved booking even when compilation failed', () => {
  assert.equal(activeCameraStreamDeadline([booking()], now), now + 60000);
  for (const changes of [{ session_status: 'cancelled' }, { session_status: 'failed' },
    { approved_run_type: 'unapproved' }, { scheduled_start: 'invalid' }, { scheduled_end: 'invalid' },
    { scheduled_start: new Date(now + 30000).toISOString() },
    { scheduled_end: new Date(now).toISOString() }]) {
    assert.equal(activeCameraStreamDeadline([booking(changes)], now), 0, JSON.stringify(changes));
  }
  assert.equal(activeCameraStreamDeadline([], now), 0);
});

// Run the production tick with media/cloud boundaries mocked. No robot or OBS
// process is started by this test, including the staging-failure fallback.
const source = readFileSync(new URL('./robot-stream-bridge.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('bridge.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const tick = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'tick').getText(ast);

test('dispatcher restart cannot replay an exhausted Navi cleanup or convert its failure to success', () => {
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'endCleanupCanRun').getText(ast);
  const canRun = new Function(`${fn}; return endCleanupCanRun;`)();
  const old = { status: 'finished', executionModel: 'navi', executionStatus: 'failed',
    endCleanupRequired: true, endCleanupStatus: 'failed', endCleanupAttempts: 3, naviCleanupOwner: null };
  const before = JSON.stringify(old);
  assert.equal(canRun(old), false);
  assert.equal(JSON.stringify(old), before);
  assert.equal(canRun({ ...old, naviCleanupOwner: { pid: 1 } }), true);
  assert.equal(canRun({ ...old, endCleanupAttempts: 2 }), true);
});
function fixture({ sessions = [booking()], stageError, deadline = 0, fetchError } = {}) {
  const events = [];
  const bindings = { state: { sessions: {} }, Date: { now: () => now }, cameraStreamDeadline: deadline,
    activeCameraStreamDeadline, keepsStreamActive: () => false,
    dueSessions: async () => { if (fetchError) throw fetchError; return sessions; },
    reviewedSubmission: async () => ({ code: 'Agentech.turn_head()' }),
    stage: () => { events.push('stage'); throw stageError ?? new Error('compiler refused'); },
    startObs: async () => { events.push('start-camera'); },
    stopObs: async () => { events.push('stop-camera'); },
    stopObsVirtualCamera: async () => { events.push('virtual-camera-check'); },
    launch: async () => { events.push('ROBOT-LAUNCH'); },
    console: { error() {} },
  };
  const run = new Function(...Object.keys(bindings), `${tick}; return tick();`);
  return { events, run: () => run(...Object.values(bindings)) };
}

test('a staging failure starts the camera for the booked window without launching robot code', async () => {
  const f = fixture({ stageError: new Error('EEXIST') });
  await f.run();
  assert.ok(f.events.includes('start-camera'));
  assert.ok(!f.events.includes('ROBOT-LAUNCH'));
});

test('a cached camera booking prevents stop/start churn and still expires on cloud failure', async () => {
  const active = fixture({ deadline: now + 60000 });
  await active.run();
  assert.ok(!active.events.includes('stop-camera'));
  const expired = fixture({ deadline: now, fetchError: new Error('cloud offline') });
  await assert.rejects(expired.run(), /cloud offline/);
  assert.ok(expired.events.includes('stop-camera'));
});

test('a future booking with a staging failure does not start video early', async () => {
  const f = fixture({ sessions: [booking({ scheduled_start: new Date(now + 30000).toISOString() })] });
  await f.run();
  assert.ok(!f.events.includes('start-camera'));
  assert.ok(!f.events.includes('ROBOT-LAUNCH'));
});
