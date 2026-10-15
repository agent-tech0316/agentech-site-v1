import assert from 'node:assert/strict';
import test from 'node:test';
import { getMasterRecording, recordingDownloadPath } from './master-session-recordings.ts';

const id='fc88493f-2d5d-4560-ac20-f95eeea8cc20';
const file='a'.repeat(32)+'-00001.jsonl.gz';
const row={session_id:123, recording_id:id, profile_id:45, profile_username:'user-a',
  account_email:'a@example.com', capture_status:'complete',storage_status:'available',
  manifest:{session:{session_id:123,recording_id:id,profile_id:45},files:[{path:file,bytes:42,sha256:'a'.repeat(64)}], attempts:[]}};
const parent={id:123,email:'a@example.com',robot_model:'Master',access_profile_id:45};
const deps={session:async()=>parent,recording:async()=>row};

test('recording access is bound to the signed account and original profile, never username',async()=>{
  assert.equal(await getMasterRecording('',123,deps),null);
  assert.equal(await getMasterRecording('b@example.com',123,deps),null);
  const own=await getMasterRecording('a@example.com',123,deps);
  assert.equal(own?.profile_username,'user-a');
  assert.equal(await getMasterRecording('a@example.com',123,{...deps,session:async()=>({...parent,access_profile_id:46})}),null);
  assert.equal(await getMasterRecording('b@example.com',123,{...deps,session:async()=>({...parent,email:'b@example.com'})}),null);
});

test('wrong robot, changed manifest binding and deleted data are unavailable',async()=>{
  assert.equal(await getMasterRecording('a@example.com',123,{...deps,session:async()=>({...parent,robot_model:'Navi'})}),null);
  assert.equal(await getMasterRecording('a@example.com',123,{...deps,recording:async()=>({...row,storage_status:'deleted'})}),null);
  await assert.rejects(()=>getMasterRecording('a@example.com',123,{...deps,recording:async()=>({...row,manifest:{...row.manifest,session:{...row.manifest.session,session_id:124}}})}));
});

test('downloads use only exact manifest files under the bound record prefix',()=>{
  assert.equal(recordingDownloadPath(row,file),`master/session-123/${id}/${file}`);
  for(const name of ['../other.json','x/'+file,'recording.zip','manifest.json']){
    assert.throws(()=>recordingDownloadPath(row,name));
  }
  assert.throws(()=>recordingDownloadPath({...row,storage_status:'local'},file));
});
