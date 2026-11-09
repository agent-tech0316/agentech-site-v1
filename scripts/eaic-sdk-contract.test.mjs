import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScriptModule} from './test-utils/load-typescript-module.mjs';
import {gatewayAssignment,ownsGatewaySession} from './eaic-gateway-assignment.mjs';
import {reconcileNaviCleanupOutcome} from './navi-session-handoff.mjs';
const {parseSdkProgram,eaicSdkContract,sdkEntry}=loadTypeScriptModule('features/eaic/02-unified-api/projects-validation/eaic-sdk-contract.ts');
const {checkAgentechSoftware}=loadTypeScriptModule('features/eaic/02-unified-api/projects-validation/agentech-validation.ts');
test('cloud supports current read/report source and enforces every policy entry',()=>{
  const source='x = Agentech.read()\nAgentech.report(data=x)';
  assert.equal(parseSdkProgram(source,'navi')[1].args.data.$sdk_result,'x');
  assert.equal(checkAgentechSoftware(source,'Navi').status,'PASS');
  for(const e of eaicSdkContract.entries){
    if(e.policy==='customer')assert.equal(sdkEntry(e.robot,e.method).id,e.id);
    else assert.throws(()=>sdkEntry(e.robot,e.method));
  }
});
test('expanded signatures retain existing limits and forbid maintenance/connection escape',()=>{
  for(const [model,code] of [
    ['master','Agentech.read()\nAgentech.turn_head(1000)'],
    ['master','Agentech.standing_actions.turn_head(1000)'],
    ['master','Agentech.seated_actions.turn_head(5)\nAgentech.wave("right")'],
    ['master','Agentech.standing_actions.teach_wrist("right")'],
    ['navi','Agentech.read(host="evil")'],
    ['navi','Agentech.report(data={"ok":True})'],
    ['navi','Agentech.do_action(260)'],
    ['aegis','Agentech.run_sequence([{"action":"robot"}])']
  ])assert.throws(()=>parseSdkProgram(code,model),code);
});
test('new gateways fail closed without explicit booking assignments',()=>{
  assert.equal(gatewayAssignment({}),null);
  assert.throws(()=>gatewayAssignment({AGENTECH_GATEWAY_ID:'new-pc'}));
  const a=gatewayAssignment({AGENTECH_GATEWAY_ID:'new-pc',AGENTECH_GATEWAY_MODELS:'["navi"]',AGENTECH_GATEWAY_SESSION_IDS:'["42"]'});
  assert.equal(ownsGatewaySession(a,{id:42,robot_model:'Navi'}),true);
  assert.equal(ownsGatewaySession(a,{id:43,robot_model:'Navi'}),false);
  assert.equal(ownsGatewaySession(a,{id:42,robot_model:'Master'}),false);
});
test('read-only Navi completion never establishes a physical reset baseline',()=>{
  const owner={attempt_id:'a',read_only:true,sdk_contract:eaicSdkContract.hash};
  const outcome={version:1,attempt_id:'a',outcome:'read-only-completed',robot_commands_sent:false,sdk_contract:eaicSdkContract.hash};
  const result=reconcileNaviCleanupOutcome(owner,false,outcome);
  assert.equal(result.status,'not_required');assert.equal(result.verified_at,undefined);
  assert.equal(reconcileNaviCleanupOutcome({...owner,read_only:false},false,outcome).status,'failed');
  assert.equal(reconcileNaviCleanupOutcome(owner,true,outcome).status,'running');
});
