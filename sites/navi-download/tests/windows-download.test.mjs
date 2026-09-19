import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const releases=JSON.parse(readFileSync('components/navi-download/releases.json','utf8'));
for(const [type,release] of Object.entries(releases)) test(`${type} download reassembles to the exact v9.14 file`,()=>{
 const parts=release.parts.map(path=>readFileSync(`public${path}`));
 assert.ok(parts.every(part=>part.length<=25*1024*1024));
 const data=Buffer.concat(parts);assert.equal(data.length,release.size);
 assert.equal(createHash('sha256').update(data).digest('hex'),release.sha256);
 assert.equal(release.filename,type==='source'?'Agentech-v9.14-source.zip':'AgentechV1.0.exe');
});
test('source ZIP button is exposed and main-domain assets use the download proxy',()=>{
 const page=readFileSync('components/navi-download/navi-download-page.tsx','utf8');
 const button=readFileSync('components/navi-download/windows-download-button.tsx','utf8');
 assert.match(page,/<WindowsDownloadButton source/);assert.match(button,/link.download = filename/);
 assert.match(button,/\/download\/app-files\//);
});
