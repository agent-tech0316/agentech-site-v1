import contract from '../../../../scripts/eaic-sdk-contract.json';
import {LiteralParser,sourceStatements,validateExpandedMasterArguments} from './master-execution-contract';
import type {SoftwareCheckReport} from './agentech-validation';
import {validateExpandedSdkValues} from './agentech-validation';

type Value=null|boolean|number|string|Value[]|{[key:string]:Value};
type Parameter={name:string;kind:string;required:boolean;annotation:string;defaultSource?:string};
type Entry={id:string;robot:string;method:string;parameters:Parameter[];varargs:string|null;policy:string;reason:string|null;effect:string};
export const eaicSdkContract=contract;
const entries=new Map((contract.entries as Entry[]).map(e=>[e.id,e]));
const constants=Object.fromEntries(['left','right','both','stand','sit','master'].map(x=>[x,x]));
const runtimeBound=new Set(['host','port','backend','target','variant','dry_run','timeout','client_factory','native_executor','connect_kwargs','ssh_username','ssh_password','ssh_port','relay_url','relay_token','repository_root']);
const pathNames=new Set(['path','output','csv_path','log_path','metadata_path','recording','recording_path']);
const raw=new Set(['adjust_right_shoulder','adjust_left_shoulder','adjust_right_elbow','adjust_left_elbow','adjust_both_elbows','adjust_elbow','adjust_right_wrist','adjust_left_wrist','adjust_wrist','adjust_upper_body','adjust_waist','return_waist_to_neutral','move_arms_to','move_elbows_to','move_mirrored_arms_to','mirror_arm_pose','movement_b','showcase','restore_wrist','restore_elbow','hold_arm_pose']);
const isRef=(value:Value):value is {$sdk_result:string}=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.$sdk_result==='string';
const refName=(name:string)=>/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)&&!['Agentech','agentech','dog',...Object.keys(constants),'True','False','None'].includes(name);

export function sdkEntry(model:string,method:string):Entry {
  const e=entries.get(model+':'+method);if(!e)throw Error('Unknown '+model+' SDK command: '+method);
  if(e.policy!=='customer')throw Error(method+': '+(e.reason||'SDK command is disabled'));
  return e;
}
function validLiteral(value:Value,refs:Set<string>,depth=0):void {
  if(depth>8)throw Error('SDK arguments are nested too deeply.');
  if(isRef(value)){if(!refs.has(value.$sdk_result))throw Error('Use an earlier SDK result.');return;}
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('Use finite numeric SDK arguments.');
  if(typeof value==='string'&&value.length>8192)throw Error('SDK text is too long.');
  if(Array.isArray(value)){if(value.length>100)throw Error('SDK list is too long.');for(const v of value)validLiteral(v,refs,depth+1);}
  else if(value!==null&&typeof value==='object'){
    if(Object.keys(value).length>100)throw Error('SDK map is too large.');
    for(const [k,v] of Object.entries(value)){if(['__proto__','constructor','prototype','$sdk_result'].includes(k)||k.startsWith('__'))throw Error('Unsupported SDK map key.');validLiteral(v,refs,depth+1);}
  }
}
export function validateSdkArguments(e:Entry,args:Record<string,Value>,refs:Set<string>):void {
  validLiteral(args,refs);
  const parameters=new Map(e.parameters.filter(p=>!p.name.startsWith('_')).map(p=>[p.name,p]));
  for(const [name,value] of Object.entries(args)){
    const p=parameters.get(name);if(!p||runtimeBound.has(name)||name.startsWith('_'))throw Error('Unknown or runtime-bound SDK parameter: '+name);
    if(isRef(value))continue;
    if(value===null&&(p.annotation.includes('None')||p.defaultSource==='None'))continue;
    if(p.annotation==='bool'&&typeof value!=='boolean')throw Error(name+' must be boolean.');
    if(p.annotation==='int'&&!Number.isInteger(value))throw Error(name+' must be integer.');
    if(p.annotation==='float'&&(typeof value!=='number'||!Number.isFinite(value)))throw Error(name+' must be numeric.');
    if(['str','str | Path'].includes(p.annotation)&&typeof value!=='string')throw Error(name+' must be text.');
    if(pathNames.has(name)&&value!==null&&(typeof value!=='string'||!value||value.length>240||/[\\:]/.test(value)||value.startsWith('/')||value.split('/').some(x=>['.','..'].includes(x))))throw Error('Use a path relative to the session workspace.');
    if(name==='data'&&value!==null)throw Error('Report data must reference an earlier trusted SDK read result.');
  }
  for(const p of parameters.values())if(p.required&&!Object.hasOwn(args,p.name))throw Error('Missing SDK parameter: '+p.name);
  if(e.robot==='navi'&&['do_action','do_behavior'].includes(e.method)){
    const value=String(args[e.method==='do_action'?'action':'behavior']).toLowerCase().replace(/[\s_-]/g,'');
    if(['260','backflip','recoverystand'].includes(value))throw Error('Navi action is disabled by the SDK.');
  }
  if(e.robot==='master'&&e.method==='heart'&&(args.posture==='sit'||args.hand==='sit'))throw Error('Seated heart requires the separate operator qualification workflow.');
  if(e.robot==='master')validateExpandedMasterArguments(e.method,args);
  else validateExpandedSdkValues(e.robot,e.method,args);
  if(e.robot==='aegis'&&e.method==='run_sequence'){
    if(!Array.isArray(args.actions)||!args.actions.length||args.actions.length>100)throw Error('Use 1 through 100 SDK sequence actions.');
    for(const action of args.actions){
      if(!action||typeof action!=='object'||Array.isArray(action)||Object.keys(action).some(k=>!['action','params'].includes(k))||typeof action.action!=='string'||['run_sequence','emergency_stop'].includes(action.action))throw Error('Nested sequences are not allowed; emergency_stop must be a terminal top-level call.');
      const params=action.params??{};if(!params||typeof params!=='object'||Array.isArray(params))throw Error('Use SDK action parameters.');
      validateSdkArguments(sdkEntry(e.robot,action.action),params,refs);
    }
  }
}

export type SdkCall={name:string;args:Record<string,Value>;positional:Value[];sdk:true;line:number;save_result_as?:string;source:string};
export function parseSdkProgram(source:string,model:string):SdkCall[] {
  if(source.length>64000)throw Error('SDK program exceeds 64,000 characters.');
  const imported:Record<string,string>=Object.create(null),refs=new Set<string>(),calls:SdkCall[]=[];
  const resultSources=new Map<string,string>();
  const masterModes=new Set<string>();
  let selected=false,rawEntry=false;
  let operationCount=0;
  for(const statement of sourceStatements(source)){
    const imports=statement.text.match(/^from\s+agentech\s+import\s+(.+)$/);
    if(imports){
      const names=imports[1].replace(/^\((.*)\)$/,'$1').split(',').map(x=>x.trim()).filter(Boolean);
      if(calls.length||selected||!names.length||names.some(x=>x!=='Agentech'&&!Object.hasOwn(constants,x)))throw Error('Use canonical Agentech imports before commands.');
      for(const name of names)if(Object.hasOwn(constants,name))imported[name]=constants[name];continue;
    }
    if(statement.text==='import agentech'&&!selected&&!calls.length)continue;
    const match=statement.text.match(/^(?:([A-Za-z_]\w*)\s*=\s*)?(?:Agentech|agentech\.Agentech|dog)\.((?:standing_actions\.|seated_actions\.)?[A-Za-z_]\w*)\s*\(([\s\S]*)\)$/);
    if(!match)throw Error('Use direct SDK calls with literal arguments or earlier SDK results.');
    const [,capture,name,argumentsText]=match;
    if(name==='use'){
      const setup=new LiteralParser(argumentsText,imported).arguments(['robot']);
      if(capture||selected||calls.length||Object.keys(setup).length!==1||setup.robot!==model)throw Error('Robot selection must match the reviewed model and precede commands.');
      selected=true;continue;
    }
    const entry=sdkEntry(model,name),slots=entry.parameters.filter(p=>p.kind==='positional'&&!p.name.startsWith('_')).map(p=>p.name);
    const variadic=entry.varargs?Array.from({length:100},(_,i)=>'$column'+i):[];
    const values=new LiteralParser(argumentsText,imported,refs,true).arguments([...slots,...variadic]) as Record<string,Value>;
    const extra=variadic.filter(n=>Object.hasOwn(values,n)).map(n=>{const v=values[n];delete values[n];return v;});
    validateSdkArguments(entry,values,refs);validLiteral(extra,refs);
    operationCount+=model==='aegis'&&name==='run_sequence'?(values.actions as Value[]).length:1;
    if(operationCount>100)throw Error('SDK program exceeds 100 commands including sequence children.');
    const base=name.split('.').at(-1)!;
    if(model==='master'){
      if(entry.effect==='action')masterModes.add(name.startsWith('seated_actions.')||values.posture==='sit'?'sit':'stand');
      if(masterModes.size>1)throw Error('Customer plans cannot change between seated and standing owners; use separate operator setup.');
      if(base==='undo_waist'&&(!isRef(values.movement)||resultSources.get(values.movement.$sdk_result)!=='adjust_waist'))throw Error('undo_waist requires an earlier captured adjust_waist result.');
      if(raw.has(base)&&!name.startsWith('seated_actions.')&&values.posture!=='sit'&&!rawEntry)throw Error('Master adjustments require enter_stand_hand_guide("both") before adjustment commands.');
      if(base==='enter_stand_hand_guide'){if((values.side??'both')!=='both')throw Error('EAIC requires the bilateral standing owner.');rawEntry=true;}
      else if(['restore_stand_hand_guide','restore_stand_default','release_returned_hold','release_return_hold','golf','golf_put'].includes(base))rawEntry=false;
    }
    if(calls.at(-1)?.name==='emergency_stop')throw Error('Emergency stop must be terminal.');
    const call:SdkCall={name,args:values,positional:extra,sdk:true,line:statement.line,source:statement.text};
    if(capture){if(!refName(capture)||refs.has(capture))throw Error('Use a unique ordinary SDK result name.');call.save_result_as=capture;refs.add(capture);resultSources.set(capture,base);}
    calls.push(call);
  }
  if(!calls.length||calls.length>100)throw Error('Use 1 through 100 SDK commands.');
  return calls;
}

export function checkSdkProgram(source:string,robotModel:string):SoftwareCheckReport {
  try{
    const calls=parseSdkProgram(source,robotModel);
    return {status:'PASS',commands:calls.map(c=>c.name),findings:[],checklist:[
      {name:'Current SDK contract',status:'PASS',detail:calls.length+' customer commands match SDK '+contract.revision.slice(0,7)+'.'},
      {name:'Gateway admission',status:'PASS',detail:'The gateway revalidates contract, runtime, booking, identity, values and hardware prerequisites before dispatch. This is not physical qualification.'},
    ]};
  }catch(error){return {status:'FAIL',commands:[],findings:[{code:'SDK_CONTRACT_INVALID',message:error instanceof Error?error.message:'Invalid SDK program.'}],checklist:[{name:'Current SDK contract',status:'FAIL',detail:'Correct the SDK contract error before review.'}]};}
}
