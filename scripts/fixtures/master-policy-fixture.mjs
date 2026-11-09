import ultraProfile from "../master-ultra-native-profile.json" with {type:"json"};

function varint(value) {
  const bytes = [];
  while (value >= 128) { bytes.push(value % 128 + 128); value = Math.floor(value / 128); }
  return Buffer.from([...bytes, value]);
}
export const field = (tag, value) => typeof value === "number"
  ? Buffer.concat([varint(tag * 8), varint(value)])
  : Buffer.concat([varint(tag * 8 + 2), varint(Buffer.byteLength(value)), Buffer.from(value)]);
export const message = (...fields) => Buffer.concat(fields);
function io(name, dims, type = 1) {
  const shape = message(...dims.map(d => field(1, field(1, d))));
  return message(field(1, name), field(2, field(1, message(field(1, type), field(2, shape)))));
}
export function policy({obs = 151, acts = 29, frames = "100", domain = "", op = "Gemm",
  phaseFrames = 100, shoulderAction = 0, badWeight = false, external = false, extraModel = Buffer.alloc(0), type = 1, metadata = {}, omitOutput = "", wrongGains = false} = {}) {
  const weights = Buffer.alloc(obs * acts * 4);
  if (shoulderAction) weights.writeFloatLE(-shoulderAction,(60*acts+11)*4);
  if (badWeight) weights.writeFloatLE(Infinity);
  const tensor = message(field(1, obs), field(1, acts), field(2, 1), field(8, "weights"),
    field(9, weights), ...(external ? [field(13, field(1, "location"))] : []));
  const node = message(field(1, "obs"), field(1, "weights"), field(2, "actions"), field(4, op), field(7, domain));
  const nativeOutputs = {
    joint_pos: [1,29], joint_vel: [1,29], body_pos_w: [1,14,3], body_quat_w: [1,14,4],
    body_lin_vel_w: [1,14,3], body_ang_vel_w: [1,14,3], motion_phase: [1,2],
    ...Object.fromEntries(Object.keys(ultraProfile.parameters).map(name=>[name,[29]])),
  };
  const nativeFields = Object.entries(nativeOutputs).filter(([name])=>name!==omitOutput).flatMap(([name,shape])=>{
    const raw=Buffer.alloc(shape.reduce((a,b)=>a*b,1)*4);
    if(name==="joint_pos")ultraProfile.parameters.default_joint_pos.forEach((q,i)=>raw.writeFloatLE(q,i*4));
    if(name==="motion_phase")raw.writeFloatLE(phaseFrames-1,4);
    if(name in ultraProfile.parameters)ultraProfile.parameters[name].forEach((n,i)=>raw.writeFloatLE(wrongGains ? n+2 : n,i*4));
    return [field(12,io(name,shape)),field(5,message(...shape.map(d=>field(1,d)), field(2,1),field(8,name),field(9,raw)))];
  });
  const info = {time_step_total:frames,...(obs===151 ? {joint_names:ultraProfile.joint_names.join(","),
    ...Object.fromEntries(Object.entries(ultraProfile.parameters).map(([k,v])=>[k,v.join(",")]))} : {}),...metadata};
  const graph = message(field(1, node), field(2, "policy"), field(5, tensor), field(11, io("obs", [1, obs], type)),
    field(11, io("time_step", [1, 1])), field(12, io("actions", [1, acts])),...(obs===151 ? nativeFields : []));
  return message(field(1, 8), field(7, graph), field(8, field(2, 18)),
    ...Object.entries(info).filter(([,v])=>v!==null).map(([k,v])=>field(14,message(field(1,k),field(2,v)))),extraModel);
}
