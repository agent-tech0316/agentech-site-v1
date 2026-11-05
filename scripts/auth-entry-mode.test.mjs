import test from 'node:test';
import assert from 'node:assert/strict';
const {initialAuthMode}=await import('../lib/auth-entry-mode.ts');
const {loginDisplayEmail}=await import('../lib/auth-entry-mode.ts');
test('registration stays the default and recovery links open recovery',()=>{
 assert.equal(initialAuthMode(null),'signup');assert.equal(initialAuthMode('forgot'),'forgot');assert.equal(initialAuthMode('signin'),'signin');assert.equal(initialAuthMode('https://evil.invalid'),'signup');
});

test('a cached identity offers Continue only for ordinary login, never after sign-out or reauthentication',()=>{
 const email='operator@example.test';
 assert.equal(loginDisplayEmail(email,false,null),email);
 assert.equal(loginDisplayEmail(email,false,'1'),'');
 assert.equal(loginDisplayEmail(email,true,null),'');
});

test('EAIC sign-in returns only to the reviewed editor and restores only this tab’s matching draft', async () => {
 const {saveReviewDraft,readReviewDraft,clearReviewDraft,reviewReauthReturn}=await import('../lib/eaic-review-reauth.ts');
 const store=new Map(), storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const draft={code:'Agentech.stand()',robotModel:'Navi',uploadedFileName:'run.py',uploadedOriginalCode:'Agentech.stand()'};
 const url=new URL(saveReviewDraft(storage,draft,'reviewed-id'),'https://www.agent-tech.ai');
 const next=url.searchParams.get('next'), id=new URL(next,url).searchParams.get('draft');
 assert.equal(reviewReauthReturn('eaic',next),next);
 assert.equal(reviewReauthReturn('eaic','//other.example'+next),null);
 assert.equal(reviewReauthReturn('eaic','/other?draft='+id),null);
 assert.equal(reviewReauthReturn('eaic','/agentech-products/eaic-hub/software-check?draft=bad'),null);
 assert.deepEqual(readReviewDraft(storage,id),draft);
 assert.equal(readReviewDraft(storage,'different'),null);
 clearReviewDraft(storage,id);assert.equal(readReviewDraft(storage,id),null);
});
