import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubAdapter, planRetention, runRetention } from './vorld-release-retention.mjs';

const repository = 'agent-tech0316/agentech-site-v1';
const version = '0.46.0';
const tag = build => `vorld-v${version}-build${build}`;
const sha = build => build.toString(16).padStart(40, '0');
const config = {
  version, build: '52', bytes: 1024, sha256: 'a'.repeat(64),
  downloadUrl: `https://github.com/${repository}/releases/download/${tag(52)}/VORLD.exe`,
};
const ref = build => ({ ref: `refs/tags/${tag(build)}`, object: { sha: sha(build), type: 'commit' } });
function release(build, overrides = {}) {
  return {
    id: build, tag_name: tag(build), draft: false, prerelease: false,
    published_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z',
    assets: build === 52 ? [{ id: 520, browser_download_url: config.downloadUrl,
      size: config.bytes, digest: `sha256:${config.sha256}`, state: 'uploaded' }] : [],
    ...overrides,
  };
}
function snapshot() {
  return { releases: [release(10), release(52), release(9)], tags: [ref(9), ref(52), ref(10)], latestReleaseId: 10 };
}
function adapterFor(initial, changeOnRead) {
  const state = structuredClone(initial);
  const calls = [];
  let reads = 0;
  return {
    calls, state,
    async readSnapshot() {
      reads++;
      changeOnRead?.(state, reads);
      return structuredClone(state);
    },
    async deleteRelease(id) {
      calls.push(['release', id]);
      state.releases = state.releases.filter(item => item.id !== id);
    },
    async deleteTag(name, expectedSha) {
      calls.push(['tag', name, expectedSha]);
      state.tags = state.tags.filter(item => item.ref !== `refs/tags/${name}`);
    },
    async markLatest(id) { calls.push(['latest', id]); state.latestReleaseId = id; },
  };
}

test('selects Build52 numerically above Build9 and Build10 regardless of API order', () => {
  const plan = planRetention(snapshot(), config);
  assert.equal(plan.repository, repository);
  assert.equal(plan.keep.build, 52);
  assert.equal(plan.keep.tag, tag(52));
  assert.deepEqual(plan.deleteReleases.map(item => item.id), [9, 10]);
  assert.deepEqual(plan.deleteTags.map(item => item.name), [tag(9), tag(10)]);
  assert.equal(plan.markLatest, true);
});

test('preserves unrelated refs, the 9/11 branch, draft/prerelease tags and higher unreleased tags', () => {
  const data = snapshot();
  data.releases.push(release(7, { draft: true, published_at: null }), release(8, { prerelease: true }),
    release(200, { tag_name: 'website-v1' }));
  data.tags.push(ref(6), ref(7), ref(8), ref(99),
    { ref: 'refs/heads/codex/eais-stable-identity-20260911', object: { sha: sha(11) } },
    { ref: 'refs/tags/website-v1', object: { sha: sha(200) } },
    { ref: 'refs/tags/vorld-v0.46.0-build10-preview', object: { sha: sha(10) } });
  const plan = planRetention(data, config);
  assert.deepEqual(plan.deleteReleases.map(item => item.id), [9, 10]);
  assert.deepEqual(plan.deleteTags.map(item => item.name), [tag(6), tag(9), tag(10)]);
});

test('fails closed for incomplete or mismatching newest assets and website metadata', () => {
  for (const change of [
    data => { data.releases[1].assets = []; },
    data => { data.releases[1].assets[0].state = 'new'; },
    data => { data.releases[1].assets[0].size++; },
    data => { data.releases[1].assets[0].digest = null; },
    data => { data.releases[1].assets[0].digest = `sha256:${'b'.repeat(64)}`; },
    data => { data.releases[1].assets[0].browser_download_url += '?other'; },
    data => { data.tags = data.tags.filter(item => item.ref !== `refs/tags/${tag(52)}`); },
  ]) {
    const data = snapshot(); change(data);
    assert.throws(() => planRetention(data, config));
  }
  for (const overrides of [{ build: '51' }, { version: '0.45.0' }, { bytes: 0 }, { sha256: '' }]) {
    assert.throws(() => planRetention(snapshot(), { ...config, ...overrides }));
  }
});

test('never downgrades to the website build when a higher stable release exists', () => {
  const data = snapshot(); data.releases.push(release(53)); data.tags.push(ref(53));
  assert.throws(() => planRetention(data, config), /website|newest/i);
  assert.throws(() => planRetention({ releases: [], tags: [], latestReleaseId: null }, config));
  data.releases.push(release(53, { id: 530, tag_name: 'vorld-v0.47.0-build53' }));
  assert.throws(() => planRetention(data, config), /ambiguous|duplicate/i);
});

test('default execution is read-only', async () => {
  const adapter = adapterFor(snapshot());
  const result = await runRetention({ adapter, config });
  assert.equal(result.mode, 'plan');
  assert.deepEqual(adapter.calls, []);
});

test('apply deletes lower releases before exact tags, marks latest, and is idempotent', async () => {
  const adapter = adapterFor(snapshot());
  const result = await runRetention({ adapter, config, apply: true });
  assert.equal(result.mode, 'applied');
  assert.deepEqual(adapter.calls, [
    ['release', 9], ['release', 10],
    ['tag', tag(9), sha(9)], ['tag', tag(10), sha(10)], ['latest', 52],
  ]);
  adapter.calls.length = 0;
  await runRetention({ adapter, config, apply: true });
  assert.deepEqual(adapter.calls, []);
});

test('apply rejects changes to the selected release or old tag before mutation', async () => {
  for (const change of [
    state => { state.tags[0].object.sha = sha(999); },
    state => { state.tags[1].object.sha = sha(999); },
    state => { state.releases[1].assets[0].size++; },
    state => { state.releases[0].draft = true; },
    state => { state.releases.push(release(53)); state.tags.push(ref(53)); },
  ]) {
    const adapter = adapterFor(snapshot(), (state, reads) => { if (reads === 2) change(state); });
    await assert.rejects(() => runRetention({ adapter, config, apply: true }));
    assert.deepEqual(adapter.calls, []);
  }
});

test('a newly published higher build during cleanup cannot be marked back to Build52', async () => {
  const adapter = adapterFor(snapshot(), (state, reads) => {
    if (reads === 3) { state.releases.push(release(53)); state.tags.push(ref(53)); }
  });
  await assert.rejects(() => runRetention({ adapter, config, apply: true }));
  assert.equal(adapter.calls.some(call => call[0] === 'latest'), false);
});

test('GitHub adapter paginates reads and uses an exact SHA lease for each tag deletion', async () => {
  const commands = [];
  const adapter = createGithubAdapter(repository, async (command, args) => {
    commands.push([command, args]);
    if (command === 'git' && args[0] === 'remote') return `https://github.com/${repository}.git\n`;
    if (args.includes('--method')) return '';
    if (command === 'git') return '';
    if (args[1].endsWith('/releases/latest')) return JSON.stringify({ id: 52 });
    if (args[1].includes('/git/matching-refs/')) return JSON.stringify([[ref(9)], [ref(52)]]);
    return JSON.stringify([[release(9)], [release(52)]]);
  });
  const data = await adapter.readSnapshot();
  assert.equal(data.releases.length, 2); assert.equal(data.tags.length, 2);
  const pages = commands.filter(([command, args]) => command === 'gh' && args.includes('--paginate'));
  assert.equal(pages.length, 2);
  assert.ok(pages.every(([, args]) => args.includes('--slurp')));
  assert.ok(commands.filter(([command]) => command === 'gh').every(([, args]) =>
    args[args.indexOf('--hostname') + 1] === 'github.com'));
  await adapter.deleteRelease(9);
  await adapter.deleteTag(tag(9), sha(9));
  await adapter.markLatest(52);
  assert.deepEqual(commands.find(([command, args]) => command === 'git' && args[0] === 'push'),
    ['git', ['push', `--force-with-lease=refs/tags/${tag(9)}:${sha(9)}`, 'origin', `:refs/tags/${tag(9)}`]]);
  assert.ok(commands.some(([command, args]) => command === 'gh' && args.includes('DELETE') && args[1].endsWith('/releases/9')));
  assert.ok(commands.some(([command, args]) => command === 'gh' && args.includes('make_latest=true')));
});

test('adapter refuses an origin pointing at another repository', async () => {
  const commands = [];
  const adapter = createGithubAdapter(repository, async (command, args) => {
    commands.push([command, args]);
    return 'https://github.com/another/repository.git\n';
  });
  await assert.rejects(() => adapter.readSnapshot(), /origin|repository/i);
  assert.deepEqual(commands.map(([command]) => command), ['git']);
});
