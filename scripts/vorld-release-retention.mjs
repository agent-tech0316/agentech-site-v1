import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { vorldRelease } from '../lib/vorld-release.ts';

const exec = promisify(execFile);
const tagPattern = /^vorld-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-build([1-9]\d*)$/;
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function parseTag(name) {
  const match = typeof name === 'string' && tagPattern.exec(name);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  return { name, version: match[1], build: Number(match[2]) };
}

function websiteIdentity(config) {
  const expected = parseTag(`vorld-v${config.version}-build${config.build}`);
  if (!expected || !Number.isSafeInteger(config.bytes) || config.bytes <= 0
      || !/^[0-9a-f]{64}$/.test(config.sha256)) throw new Error('Invalid website VORLD release metadata.');
  let url;
  try { url = new URL(config.downloadUrl); } catch { throw new Error('Invalid website download URL.'); }
  const path = /^\/([\w.-]+)\/([\w.-]+)\/releases\/download\/([^/]+)\/[^/]+$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password
      || url.search || url.hash || !path || path[3] !== expected.name) {
    throw new Error('Website download URL must identify the configured VORLD release.');
  }
  return { ...expected, repository: `${path[1]}/${path[2]}` };
}

function releaseIdentity(release) {
  if (!Number.isSafeInteger(release.id) || release.id <= 0) throw new Error('Invalid release identity.');
  return { id: release.id, tag: release.tag_name, updatedAt: release.updated_at ?? null };
}

/** Pure plan: only published stable VORLD releases and lower-build tags qualify. */
export function planRetention(snapshot, config = vorldRelease) {
  const website = websiteIdentity(config);
  if (!Array.isArray(snapshot.releases) || !Array.isArray(snapshot.tags)) throw new Error('Invalid GitHub snapshot.');
  const stable = snapshot.releases
    .filter(item => item.draft === false && item.prerelease === false && Number.isFinite(Date.parse(item.published_at)))
    .map(item => ({ release: item, parsed: parseTag(item.tag_name) }))
    .filter(item => item.parsed)
    .sort((a, b) => a.parsed.build - b.parsed.build || a.parsed.name.localeCompare(b.parsed.name));
  if (!stable.length) throw new Error('No published stable VORLD release exists.');
  const newest = stable.at(-1);
  if (stable.filter(item => item.parsed.build === newest.parsed.build).length !== 1) {
    throw new Error('Ambiguous duplicate newest VORLD build.');
  }
  if (newest.parsed.name !== website.name) {
    throw new Error('The website must match the newest published stable VORLD release before cleanup.');
  }

  const tags = new Map();
  for (const item of snapshot.tags) {
    if (typeof item.ref !== 'string' || !item.ref.startsWith('refs/tags/')) continue;
    const name = item.ref.slice('refs/tags/'.length);
    const parsed = parseTag(name);
    if (!parsed) continue;
    if (tags.has(name)) throw new Error('Duplicate VORLD tag in GitHub snapshot.');
    if (!shaPattern.test(item.object?.sha)) throw new Error('Invalid VORLD tag object SHA.');
    tags.set(name, { ...parsed, sha: item.object.sha });
  }
  const retainedTag = tags.get(newest.parsed.name);
  if (!retainedTag) throw new Error('The newest VORLD release has no matching Git tag.');
  const assets = (newest.release.assets ?? []).filter(item => item.browser_download_url === config.downloadUrl);
  if (assets.length !== 1 || assets[0].state !== 'uploaded' || assets[0].size !== config.bytes
      || assets[0].digest !== `sha256:${config.sha256}`) {
    throw new Error('The newest VORLD download asset is incomplete or does not match the website URL, bytes and SHA256.');
  }
  const protectedTags = new Set(snapshot.releases
    .filter(item => item.draft !== false || item.prerelease !== false || !Number.isFinite(Date.parse(item.published_at)))
    .map(item => item.tag_name));
  const keep = {
    ...releaseIdentity(newest.release), version: newest.parsed.version, build: newest.parsed.build,
    sha: retainedTag.sha,
    asset: { id: assets[0].id, url: config.downloadUrl, bytes: config.bytes, sha256: config.sha256 },
  };
  return {
    repository: website.repository, keep,
    deleteReleases: stable.filter(item => item.parsed.build < keep.build && !protectedTags.has(item.parsed.name))
      .map(item => releaseIdentity(item.release)),
    deleteTags: [...tags.values()].filter(item => item.build < keep.build && !protectedTags.has(item.name))
      .sort((a, b) => a.build - b.build || a.name.localeCompare(b.name))
      .map(item => ({ name: item.name, sha: item.sha })),
    markLatest: snapshot.latestReleaseId !== keep.id,
  };
}

const mutationIdentity = plan => JSON.stringify({
  keep: plan.keep, deleteReleases: plan.deleteReleases, deleteTags: plan.deleteTags,
});

/** Default is read-only. Refresh before each mutation; tag deletion also uses a Git lease. */
export async function runRetention({ adapter, config = vorldRelease, apply = false }) {
  const plan = planRetention(await adapter.readSnapshot(), config);
  if (!apply) return { mode: 'plan', ...plan };
  const deletedReleases = new Set();
  const deletedTags = new Set();
  async function refresh() {
    const current = planRetention(await adapter.readSnapshot(), config);
    const expected = { ...plan,
      deleteReleases: plan.deleteReleases.filter(item => !deletedReleases.has(item.id)),
      deleteTags: plan.deleteTags.filter(item => !deletedTags.has(item.name)),
    };
    if (mutationIdentity(current) !== mutationIdentity(expected)) {
      throw new Error('VORLD release or tag snapshot changed; inspect a fresh plan before retrying.');
    }
    return current;
  }
  for (const release of plan.deleteReleases) {
    await refresh();
    await adapter.deleteRelease(release.id);
    deletedReleases.add(release.id);
  }
  for (const tag of plan.deleteTags) {
    await refresh();
    await adapter.deleteTag(tag.name, tag.sha);
    deletedTags.add(tag.name);
  }
  const current = await refresh();
  if (current.markLatest) await adapter.markLatest(current.keep.id);
  return { mode: 'applied', repository: plan.repository, kept: plan.keep.tag,
    deletedReleases: [...deletedReleases], deletedTags: [...deletedTags], markedLatest: current.markLatest };
}

async function command(program, args) {
  try {
    return (await exec(program, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000, windowsHide: true })).stdout;
  } catch {
    // Do not echo subprocess output: a configured remote or credential helper can contain secrets.
    throw new Error(`${program} ${args[0]} failed; verify repository access and retry after inspecting the current state.`);
  }
}

export function createGithubAdapter(repository, run = command) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository.');
  const endpoint = `repos/${repository}`;
  const api = (path, ...args) => run('gh', ['api', path, '--hostname', 'github.com', ...args]);
  async function verifyOrigin() {
    const urls = (await run('git', ['remote', 'get-url', '--push', '--all', 'origin'])).trim().split(/\r?\n/);
    if (urls.length !== 1) throw new Error('Exactly one origin push URL is required.');
    let path = /^git@github\.com:([^\s]+)$/.exec(urls[0])?.[1];
    if (!path) {
      try {
        const url = new URL(urls[0]);
        if (url.hostname === 'github.com' && ['https:', 'ssh:'].includes(url.protocol) && !url.search && !url.hash) {
          path = url.pathname.slice(1);
        }
      } catch { /* Report only the safe repository mismatch below. */ }
    }
    if (path?.replace(/\.git$/, '').toLowerCase() !== repository.toLowerCase()) {
      throw new Error('The origin push repository does not match the website download repository.');
    }
  }
  async function pages(path) {
    const result = JSON.parse(await api(path, '--paginate', '--slurp'));
    if (!Array.isArray(result) || !result.every(Array.isArray)) throw new Error('Invalid paginated GitHub response.');
    return result.flat();
  }
  function validId(id) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid release ID.');
  }
  return {
    async readSnapshot() {
      await verifyOrigin();
      const [releases, tags, latest] = await Promise.all([
        pages(`${endpoint}/releases?per_page=100`),
        pages(`${endpoint}/git/matching-refs/tags/`),
        api(`${endpoint}/releases/latest`).then(JSON.parse),
      ]);
      return { releases, tags, latestReleaseId: latest.id };
    },
    async deleteRelease(id) {
      validId(id);
      await api(`${endpoint}/releases/${id}`, '--method', 'DELETE', '--silent');
    },
    async deleteTag(name, sha) {
      if (!parseTag(name) || !shaPattern.test(sha)) throw new Error('Invalid tag deletion identity.');
      await verifyOrigin();
      const ref = `refs/tags/${name}`;
      await run('git', ['push', `--force-with-lease=${ref}:${sha}`, 'origin', `:${ref}`]);
    },
    async markLatest(id) {
      validId(id);
      await api(`${endpoint}/releases/${id}`, '--method', 'PATCH', '-f', 'make_latest=true', '--silent');
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !['--apply', '--help'].includes(arg))) throw new Error('Usage: node scripts/vorld-release-retention.mjs [--apply]');
    if (args.includes('--help')) {
      console.log(JSON.stringify({ usage: 'node scripts/vorld-release-retention.mjs [--apply]', default: 'read-only plan' }));
    } else {
      const { repository } = websiteIdentity(vorldRelease);
      console.log(JSON.stringify(await runRetention({ adapter: createGithubAdapter(repository), apply: args.includes('--apply') })));
    }
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
