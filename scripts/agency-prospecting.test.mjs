import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const prospecting = await import('./agency-prospecting.mjs').catch(() => null);
const report = { date:'2026-09-28', reviewed:2, summary:'Two prospects checked.', coverage:[], businesses:[{name:'Example & Co', sourceUrl:'https://example.com/project', website:'https://example.com', score:70, evidence:['Has a public project brief.'], unknowns:['Budget not stated.'], scope:'A company website.', nextAction:'Verify budget.', draft:'Hello, I reviewed your published website brief. Would a focused five-page build fit your project?'}], agencies:[], rejected:[], followups:[] };
test('report escapes outside content and preserves sources and separate customer groups', () => {
  assert.ok(prospecting?.renderReport, 'Report renderer is not implemented');
  const result=prospecting.renderReport({...report, businesses:[{...report.businesses[0], name:'<script>alert(1)</script>'}]});
  assert.match(result.html,/&lt;script&gt;/);
  assert.doesNotMatch(result.html,/<script>/);
  assert.match(result.html,/Business prospects/);
  assert.match(result.html,/Agency partners/);
  assert.match(result.text,/Budget not stated/);
  assert.match(result.html,/https:\/\/example.com\/project/);
});
test('non-web source URLs and oversized outreach drafts are rejected before delivery', () => {
  assert.ok(prospecting?.renderReport, 'Report renderer is not implemented');
  assert.throws(()=>prospecting.renderReport({...report,businesses:[{...report.businesses[0],sourceUrl:'javascript:alert(1)'}]}),/source/i);
  assert.throws(()=>prospecting.renderReport({...report,businesses:[{...report.businesses[0],draft:'word '.repeat(151)}]}),/150/);
});
test('missing Gmail credentials never open a transport', async () => {
  assert.ok(prospecting?.deliverReport, 'Report sender is not implemented');
  let calls=0;
  const result=await prospecting.deliverReport(report,{user:'',appPassword:'',createTransport:()=>{calls++;}});
  assert.equal(result.accepted,false); assert.equal(calls,0);
});
test('Gmail delivery uses TLS and only the authorized addresses', async () => {
  assert.ok(prospecting?.deliverReport, 'Report sender is not implemented');
  let sent, config;
  const result=await prospecting.deliverReport(report,{user:'info@agent-tech.ai',appPassword:'test app password',createTransport:options=>{config=options;return {sendMail:async body=>{sent=body;return {messageId:'email-123',accepted:['info@agent-tech.ai'],rejected:[]};},close(){}};}});
  assert.equal(result.accepted,true); assert.equal(result.id,'email-123');
  assert.equal(config.host,'smtp.gmail.com'); assert.equal(config.port,465); assert.equal(config.secure,true);
  assert.equal(sent.from,'Agentech <info@agent-tech.ai>');
  assert.deepEqual(sent.to,['info@agent-tech.ai']);
  assert.equal(sent.messageId,'<agentech-prospecting-2026-09-28@agent-tech.ai>');
});
test('provider failures and malformed successes never become successful delivery', async () => {
  assert.ok(prospecting?.deliverReport, 'Report sender is not implemented');
  for (const response of [{accepted:[],rejected:['info@agent-tech.ai']},{}]) {
    const result=await prospecting.deliverReport(report,{user:'sender',appPassword:'test',createTransport:()=>({sendMail:async()=>response,close(){}})});
    assert.equal(result.accepted,false);
  }
});
test('SMTP timeout is marked uncertain to prevent an automatic duplicate', async()=>{
  const result=await prospecting.deliverReport(report,{user:'sender',appPassword:'secret-not-for-output',createTransport:()=>({sendMail:async()=>{throw new Error('secret-not-for-output');},close(){}})});
  assert.equal(result.accepted,false); assert.equal(result.uncertain,true);
  assert.doesNotMatch(result.reason,/secret-not-for-output/);
});
test('existing Resend configuration takes precedence and fixes sender, recipient, and daily idempotency',async()=>{
  let request;
  const result=await prospecting.deliverReport(report,{apiKey:'test-key',user:'unused',appPassword:'unused',createTransport:()=>{throw new Error('Must use Resend');},fetchImpl:async(url,options)=>{request={url,options};return new Response(JSON.stringify({id:'resend-id'}),{status:200});}});
  assert.equal(result.accepted,true); assert.equal(result.id,'resend-id');
  assert.equal(request.url,'https://api.resend.com/emails');
  const mail=JSON.parse(request.options.body);
  assert.equal(mail.from,'Agentech <info@agent-tech.ai>'); assert.deepEqual(mail.to,['info@agent-tech.ai']);
  assert.equal(request.options.headers['Idempotency-Key'],'agentech-prospecting-2026-09-28');
});

async function testDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'agentech-prospecting-test-'));
  t.after(async () => {
    for (const suffix of ['sent.json', 'sending.lock']) {
      await unlink(join(directory, `${report.date}.${suffix}`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(directory);
  });
  return directory;
}

test('a saved receipt suppresses another send while releasing the acquired lock', async t => {
  const directory = await testDirectory(t);
  await writeFile(join(directory, `${report.date}.sent.json`), JSON.stringify({ id: 'already-accepted' }));
  let sends = 0;
  const result = await prospecting.sendReportOnce(report, { directory, deliver: async () => { sends++; } });
  assert.equal(result.skipped, true);
  assert.equal(sends, 0);
  await assert.rejects(readFile(join(directory, `${report.date}.sending.lock`)), { code: 'ENOENT' });
});

test('overlapping runs and later retries accept only one daily report', async t => {
  const directory = await testDirectory(t);
  let release, started, sends = 0;
  const held = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const deliver = async () => { sends++; started(); await held; return { accepted: true, id: 'one-message' }; };
  const first = prospecting.sendReportOnce(report, { directory, deliver });
  await entered;
  try {
    await assert.rejects(prospecting.sendReportOnce(report, { directory, deliver }), /in progress/);
  } finally { release(); }
  assert.equal((await first).accepted, true);
  assert.equal((await prospecting.sendReportOnce(report, { directory, deliver })).skipped, true);
  assert.equal(sends, 1);
});
