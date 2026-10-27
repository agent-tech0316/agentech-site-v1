import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './test-utils/load-typescript-module.mjs';

const { observeFirstVideoFrame } = loadTypeScriptModule('lib/live-video-first-frame.ts');

test('a subscribed track is not connected until the browser renders a frame', () => {
  let callback;
  let connected = 0;
  const video = { requestVideoFrameCallback(fn) { callback = fn; return 7; }, cancelVideoFrameCallback() {}, removeEventListener() {} };
  observeFirstVideoFrame(video, () => connected++);
  assert.equal(connected, 0);
  callback();
  assert.equal(connected, 1);
});

test('changing rooms cancels frame observation and ignores a late callback', () => {
  let callback;
  let cancelled;
  let connected = false;
  const video = { requestVideoFrameCallback(fn) { callback = fn; return 7; }, cancelVideoFrameCallback(id) { cancelled = id; }, removeEventListener() {} };
  const stop = observeFirstVideoFrame(video, () => { connected = true; });
  stop();
  callback();
  assert.equal(cancelled, 7);
  assert.equal(connected, false);
});

test('older browsers need decoded video dimensions before reporting ready', () => {
  const listeners = new Map();
  let connected = 0;
  const video = { readyState: 0, videoWidth: 0, videoHeight: 0,
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); } };
  const stop = observeFirstVideoFrame(video, () => connected++);
  listeners.get('playing')();
  assert.equal(connected, 0);
  Object.assign(video, {readyState: 2, videoWidth: 1280, videoHeight: 720});
  listeners.get('playing')();
  assert.equal(connected, 1);
  stop();
  assert.equal(listeners.size, 0);
});
