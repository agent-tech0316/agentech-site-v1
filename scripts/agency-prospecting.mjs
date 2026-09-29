import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isWebUrl = value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
export const reportDirectory = join(homedir(), '.codex', 'agency-prospecting');

export function renderReport(report) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date) || !Number.isInteger(report.reviewed) || report.reviewed < 0) throw new Error('A dated report and an actual reviewed count are required.');
  if (!Array.isArray(report.businesses) || !Array.isArray(report.agencies)) throw new Error('Both prospect groups are required.');
  const text = [`AGENTECH / DAILY WEBSITE OPPORTUNITIES / ${report.date}`, '', report.summary || '', `Opportunities reviewed: ${report.reviewed}`, '', 'Research and drafts for human review. No prospect has been contacted by this workflow.'];
  let content = `<p style="color:#6e7b88;font-size:12px;letter-spacing:2px">AGENTECH / DAILY PROSPECTING</p><h1 style="font-size:28px;color:#18211d">Website opportunities</h1><p>${escape(report.date)} · ${report.reviewed} reviewed</p><p>${escape(report.summary)}</p><p style="background:#eff3e9;padding:16px">Research and drafts for human review. No prospect has been contacted by this workflow.</p>`;
  for (const [label, prospects] of [['Business prospects', report.businesses], ['Agency partners', report.agencies]]) {
    text.push('',label.toUpperCase()); content += `<h2 style="margin-top:32px">${label}</h2>`;
    if (!prospects.length) { text.push('No qualified candidates verified in this run.'); content += '<p>No qualified candidates verified in this run.</p>'; }
    for (const item of prospects) {
      if (!isWebUrl(item.sourceUrl)) throw new Error('Every prospect needs an HTTP(S) source URL.');
      if (item.website && !isWebUrl(item.website)) throw new Error('Website must be an HTTP(S) URL.');
      if (item.contactUrl && !isWebUrl(item.contactUrl)) throw new Error('Contact source must be an HTTP(S) URL.');
      if (!Number.isFinite(item.score) || item.score < 0 || item.score > 100) throw new Error('Fit score must be between 0 and 100.');
      if ((item.draft || '').trim().split(/\s+/).filter(Boolean).length > 150) throw new Error('Outreach drafts must not exceed 150 English words.');
      const facts = (item.evidence || []).map(value => `• ${value}`).join('\n');
      const unknowns = (item.unknowns || []).map(value => `• ${value}`).join('\n');
      text.push('',`${item.name} — Fit ${item.score}/100`, `Source: ${item.sourceUrl}`, `Website: ${item.website || 'Not identified'}`, `Contact source: ${item.contactUrl || 'Not verified'}`, `Observed facts:\n${facts}`, `Unknowns / risks:\n${unknowns}`, `Proposed scope: ${item.scope || 'Needs confirmation'}`, `Next action: ${item.nextAction}`, `Draft (not sent):\n${item.draft || 'Not prepared; qualification required.'}`);
      content += `<article style="border:1px solid #dce1db;padding:22px;margin:18px 0;border-radius:8px"><h3 style="margin-top:0">${escape(item.name)} <span style="font-weight:400;font-size:13px">${item.score}/100 fit</span></h3><p><a href="${escape(item.sourceUrl)}">Verified source</a>${item.website ? ` · <a href="${escape(item.website)}">Website</a>` : ''}${item.contactUrl ? ` · <a href="${escape(item.contactUrl)}">Contact source</a>` : ''}</p><b>Observed facts</b><ul>${(item.evidence || []).map(f=>`<li>${escape(f)}</li>`).join('')}</ul><b>Unknowns / risks</b><ul>${(item.unknowns || []).map(f=>`<li>${escape(f)}</li>`).join('')}</ul><p><b>Proposed scope:</b> ${escape(item.scope || 'Needs confirmation')}</p><p><b>Next:</b> ${escape(item.nextAction)}</p><div style="background:#f5f4f1;padding:16px"><b>Draft — not sent</b><p style="white-space:pre-wrap">${escape(item.draft || 'Not prepared; qualification required.')}</p></div></article>`;
    }
  }
  for (const [title, items] of [['Channel coverage', report.coverage], ['Rejected / held', report.rejected], ['Follow-up queue', report.followups]]) {
    content += `<h2 style="font-size:18px;margin-top:28px">${title}</h2><ul>`; text.push('',title.toUpperCase());
    if (!items?.length) { content += '<li>None recorded.</li>'; text.push('None recorded.'); }
    for (const item of items || []) { const line=typeof item === 'string' ? item : `${item.name || item.channel}: ${item.reason || item.note || item.action}`; content += `<li>${escape(line)}</li>`; text.push(line); }
    content += '</ul>';
  }
  return { text:text.join('\n'), html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Agentech daily prospecting — ${report.date}</title></head><body style="background:#f5f4f1;margin:0;padding:24px;font:14px/1.7 Arial,sans-serif;color:#344139"><main style="max-width:720px;margin:auto;background:white;padding:32px;border-radius:12px">${content}<p style="font-size:11px;color:#66736a;margin-top:30px">Fit scores are research judgments, not buying commitments. Confirm budget, timing, scope, and decision-maker before outreach or quoting.</p></main></body></html>` };
}

export async function deliverReport(report, { apiKey, fetchImpl=fetch, user, appPassword, createTransport } = {}) {
  const rendered = renderReport(report);
  const mail={from:'Agentech <info@agent-tech.ai>',to:['info@agent-tech.ai'],subject:`Agentech | Daily website opportunities | ${report.date}`,text:rendered.text,html:rendered.html};
  if(apiKey){
    try{
      const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`agentech-prospecting-${report.date}`},body:JSON.stringify(mail)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok || typeof result.id!=='string' || !result.id) return {accepted:false,uncertain:response.ok || response.status>=500,reason:`Resend did not confirm acceptance (HTTP ${response.status}). Check key permissions and sender-domain verification. Inspect provider logs before retrying an uncertain response.`};
      return {accepted:true,id:result.id};
    }catch{return {accepted:false,uncertain:true,reason:'Resend request failed or timed out. Inspect provider logs before retrying; the daily idempotency key is reused.'};}
  }
  if (!user || !appPassword) return { accepted:false, reason:'Configure RESEND_API_KEY locally, or AGENCY_GMAIL_USER and AGENCY_GMAIL_APP_PASSWORD. The report is saved locally; no email was sent.' };
  const factory = createTransport || (await import('nodemailer')).default.createTransport;
  const transport = factory({host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass:appPassword.replace(/\s/g,'')},connectionTimeout:20000,greetingTimeout:20000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true});
  try {
    const result=await transport.sendMail({...mail,messageId:`<agentech-prospecting-${report.date}@agent-tech.ai>`});
    if (!result.accepted?.includes('info@agent-tech.ai') || !result.messageId) return {accepted:false,uncertain:!result.rejected?.includes('info@agent-tech.ai'),reason:'Gmail did not confirm acceptance for info@agent-tech.ai. Inspect the mailbox before retrying.'};
    return {accepted:true,id:result.messageId};
  } catch(error) {
    const uncertain=error.code!=='EAUTH' && !(error.responseCode>=500);
    return {accepted:false,uncertain,reason:uncertain?'SMTP result is uncertain. Check Sent mail and the recipient inbox before retrying to avoid duplicate reports.':'Gmail rejected authentication or delivery. Check the App Password and authorized Send mail as address.'};
  } finally { transport.close(); }
}

export async function sendReportOnce(report, { directory=reportDirectory, deliver=deliverReport } = {}) {
  renderReport(report);
  await mkdir(directory,{recursive:true});
  const receiptPath=join(directory,`${report.date}.sent.json`);
  const lockPath=join(directory,`${report.date}.sending.lock`);
  const lock=await open(lockPath,'wx').catch(error=>{if(error.code==='EEXIST')throw new Error('Another send is in progress, or an interrupted send left a lock. Inspect before retrying.');throw error;});
  let preserveLock=true;
  try {
    // Check only while holding the lock, so a completed overlapping run cannot be missed.
    const existing=await readFile(receiptPath,'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(existing?.id){preserveLock=false;return {accepted:true,id:existing.id,skipped:true};}
    const result=await deliver(report);
    preserveLock=Boolean(result.uncertain || result.accepted);
    if(!result.accepted)return result;
    await writeFile(receiptPath,JSON.stringify({id:result.id,acceptedAt:new Date().toISOString(),from:'info@agent-tech.ai',to:'info@agent-tech.ai'},null,2),'utf8');
    preserveLock=false;
    return result;
  } finally { await lock.close(); if(!preserveLock) await unlink(lockPath); }
}

async function run() {
  const args=process.argv.slice(2);
  const pathIndex=args.indexOf('--report');
  if (pathIndex < 0 || !args[pathIndex+1]) throw new Error('Usage: node scripts/agency-prospecting.mjs --report <report.json> [--send]');
  const path=resolve(args[pathIndex+1]);
  const report=JSON.parse(await readFile(path,'utf8'));
  const rendered=renderReport(report);
  await mkdir(reportDirectory,{recursive:true});
  await writeFile(join(reportDirectory,`${report.date}.html`),rendered.html,'utf8');
  await writeFile(join(reportDirectory,`${report.date}.txt`),rendered.text,'utf8');
  console.log(`Report prepared: ${join(reportDirectory,`${report.date}.html`)}`);
  if (!args.includes('--send')) { console.log('Preview only. No email was sent.'); return; }
  const result=await sendReportOnce(report,{deliver:async current=>{
    const require=createRequire(import.meta.url);
    require('@next/env').loadEnvConfig(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
    return deliverReport(current,{apiKey:process.env.RESEND_API_KEY,user:process.env.AGENCY_GMAIL_USER,appPassword:process.env.AGENCY_GMAIL_APP_PASSWORD});
  }});
  if(result.skipped){console.log(`Already accepted by email provider for ${report.date}; duplicate skipped.`);return;}
  if(!result.accepted){console.error(result.reason);process.exitCode=2;return;}
  console.log(`Accepted by email provider: ${result.id}. Inbox delivery has not been independently confirmed.`);
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) run().catch(error=>{console.error(error.message);process.exitCode=1;});
