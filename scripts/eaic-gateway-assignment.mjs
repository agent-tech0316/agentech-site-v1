// New gateways opt into explicit model/booking assignment. The unset legacy
// environment preserves an existing installation; a partially configured new
// gateway fails closed and cannot silently become a second global poller.
import {readFileSync} from 'node:fs';
const contract=JSON.parse(readFileSync(new URL('./eaic-sdk-contract.json',import.meta.url),'utf8'));
export function isSdkReadOnly(plan,model) {
  return plan?.sdk_contract===contract.hash&&plan.sdk_revision===contract.revision&&plan.robot_model===model
    &&Array.isArray(plan.commands)&&plan.commands.length>0&&plan.commands.every(c=>c.sdk===true&&contract.entries.some(e=>e.robot===model&&e.method===c.name&&e.policy==='customer'&&['local','observe'].includes(e.effect)));
}
export function gatewayAssignment(env=process.env) {
  if(!env.AGENTECH_GATEWAY_ID&&!env.AGENTECH_GATEWAY_MODELS&&!env.AGENTECH_GATEWAY_SESSION_IDS)return null;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(env.AGENTECH_GATEWAY_ID??''))throw Error('Set a unique gateway identity');
  const models=JSON.parse(env.AGENTECH_GATEWAY_MODELS??'null');
  const ids=JSON.parse(env.AGENTECH_GATEWAY_SESSION_IDS??'null');
  if(!Array.isArray(models)||!models.length||models.some(x=>!['master','navi','aegis'].includes(x)))throw Error('Assign at least one supported robot model');
  if(!Array.isArray(ids)||!ids.length||ids.some(x=>typeof x!=='string'||!/^\d+$/.test(x)))throw Error('Assign explicit booking IDs before starting a new gateway');
  return {id:env.AGENTECH_GATEWAY_ID,models:new Set(models),sessionIds:new Set(ids)};
}
export function ownsGatewaySession(assignment,session) {
  if(!assignment)return true;
  const model=String(session.robot_model??'').toLowerCase().replace('aegies','aegis');
  return assignment.models.has(model)&&assignment.sessionIds.has(String(session.id));
}
