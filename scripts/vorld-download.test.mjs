import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('VORLD download follows the existing hero actions on its own row', () => {
  const page = read('app/agentech-products/eaic/page.tsx');
  assert.match(page, /Explore outcomes[\s\S]*?<\/div>\s*<div[^>]*data-vorld-download/);
  assert.match(page, /href=\{vorldRelease.downloadUrl\}/);
  assert.match(page, /Download VORLD for Windows/);
  assert.match(page, /href="\/downloads\/VORLD-Development-README.md"/);
  assert.match(read('app/agentech-products/eaic/eaic-public.css'), /\[data-eaic-public-page\] \[data-vorld-download\]/);
});

test('the release points to a versioned Windows installer and supplies a PowerShell guide', () => {
  const release = read('lib/vorld-release.ts');
  assert.match(release, /https:\/\/github.com\/agent-tech0316\/agentech-site-v1\/releases\/download\/vorld-v0\.45\.0-build51\/VORLD-0\.45\.0-Build51-Setup-Windows-x64\.exe/);
  assert.match(release, /sha256: "[a-f0-9]{64}"/);
  const guide = read('public/downloads/VORLD-Development-README.md');
  for (const command of ['npm.cmd ci', 'npm.cmd start', 'npm.cmd test', 'npm.cmd run package:win']) assert.ok(guide.includes(command));
  assert.match(guide, /build\.extraResources/);
});
