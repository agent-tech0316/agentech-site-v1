import { fail, protobuf } from "./asset-content-protobuf.ts";

import ultraProfile from "../../../../scripts/master-ultra-native-profile.json" with {type:"json"};

export type MasterPolicyContract = {
  model: "Master Ultra" | "Master Edu";
  observationSize: number;
  actionSize: number;
  controlHz: 50;
  frameCount: number;
  opset: number;
  evidence: "static-interface";
};

type Fields = ReturnType<typeof fields>;
type Tensor = { shape: number[]; type: number; smallIntegers?: number[]; smallFloats?: number[] };
const maxTensorElements = 16 * 1024 * 1024;
const maxNodes = 2048;
const maxFrameCount = 60 * 60 * 50;

function fields(data: Buffer) { return [...protobuf(data)]; }
function bytes(message: Fields, tag: number, required = true): Buffer {
  const values = message.filter(f => f.tag === tag);
  if (!required && !values.length) return Buffer.alloc(0);
  if (values.length !== 1 || values[0].wire !== 2 || !Buffer.isBuffer(values[0].value)) fail("ONNX contains a missing, invalid or repeated field.");
  return values[0].value;
}
function integer(message: Fields, tag: number) {
  const values = message.filter(f => f.tag === tag);
  if (values.length !== 1 || typeof values[0].value !== "bigint") fail("Invalid ONNX integer field.");
  return Number(BigInt.asIntN(64, values[0].value));
}
function text(data: Buffer) {
  if (!data.length || data.length > 4096 || data.includes(0)) fail("Invalid ONNX name or metadata.");
  return new TextDecoder("utf-8", {fatal: true}).decode(data);
}
function buffers(message: Fields, tag: number) {
  return message.filter(f => f.tag === tag).map(f => {
    if (f.wire !== 2 || !Buffer.isBuffer(f.value)) fail("Invalid ONNX field encoding.");
    return f.value;
  });
}
function integers(message: Fields, tag: number) {
  const result: number[] = [];
  for (const field of message.filter(f => f.tag === tag)) {
    if (typeof field.value === "bigint") result.push(Number(BigInt.asIntN(64, field.value)));
    else {
      if (field.wire !== 2) fail("Invalid packed ONNX integers.");
      let v = BigInt(0), shift = 0;
      for (const byte of field.value) {
        if (shift === 63 && byte > 1) fail("Invalid ONNX integer.");
        v |= BigInt(byte & 127) << BigInt(shift);
        if (byte & 128) shift += 7;
        else { result.push(Number(BigInt.asIntN(64, v))); shift = 0; v = BigInt(0); }
        if (result.length > 100000) fail("ONNX integer list exceeds the inspection limit.");
      }
      if (shift) fail("Truncated packed ONNX integer.");
    }
  }
  return result;
}
function elementCount(shape: number[]) {
  const count = shape.reduce((size, dim) => size * dim, 1);
  if (shape.length > 8 || shape.some(d => !Number.isSafeInteger(d) || d < 1) || !Number.isSafeInteger(count) || count > maxTensorElements)
    fail("ONNX tensor dimensions exceed the supported limits.");
  return count;
}
function finiteFloat(data: Buffer, offset: number) {
  const value = data.readFloatLE(offset);
  if (!Number.isFinite(value)) fail("ONNX weights and attributes must be finite.");
  return value;
}
function tensor(data: Buffer): Tensor {
  const m = fields(data);
  if (m.some(f => f.tag === 13 || (f.tag === 14 && f.value !== BigInt(0)))) fail("ONNX external tensor data is not supported.");
  const shape = integers(m, 1), count = elementCount(shape), type = integer(m, 2);
  if (![1, 6, 7].includes(type)) fail("Master policy constants must be float32, int32 or int64 tensors.");
  if (m.some(f => ![1, 2, 4, 5, 7, 8, 9, 12, 14].includes(f.tag))) fail("Unsupported ONNX tensor data.");
  const raw = bytes(m, 9, false);
  if (m.some(f=>f.tag===9) && !raw.length) fail("ONNX tensor contains an empty raw payload.");
  const typedTag = type === 1 ? 4 : type === 6 ? 5 : 7;
  if (m.some(f => [4, 5, 7].includes(f.tag) && (f.tag !== typedTag || raw.length))) fail("Conflicting ONNX tensor encodings.");
  let smallIntegers: number[] | undefined;
  const smallFloats = type === 1 && count <= 29 ? [] as number[] : undefined;
  function checkFloats(data: Buffer) {
    for (let i = 0; i < data.length; i += 4) {
      const value = finiteFloat(data,i);
      if (smallFloats) smallFloats.push(value);
    }
  }
  if (raw.length) {
    const width = type === 7 ? 8 : 4;
    if (raw.length !== count * width) fail("ONNX tensor size does not match its dimensions.");
    if (type === 1) checkFloats(raw);
    else if (count <= 8) smallIntegers = Array.from({length: count}, (_, i) => type === 6 ? raw.readInt32LE(i * 4) : Number(raw.readBigInt64LE(i * 8)));
  } else if (type === 1) {
    let floats = 0;
    for (const field of m.filter(f => f.tag === 4)) {
      if (!Buffer.isBuffer(field.value) || ![2, 5].includes(field.wire) || field.value.length % 4) fail("Malformed ONNX float data.");
      floats += field.value.length / 4;
      if (floats > count) fail("ONNX float data exceeds declared dimensions.");
      checkFloats(field.value);
    }
    if (floats !== count) fail("ONNX float data is incomplete.");
  } else {
    const values = integers(m, typedTag);
    if (values.length !== count) fail("ONNX integer data is incomplete.");
    if (count <= 8) smallIntegers = values;
  }
  return {shape, type, smallIntegers, smallFloats};
}
function valueInfo(data: Buffer): [string, Tensor] {
  const m = fields(data), type = fields(bytes(m, 2));
  if (type.some(f => f.tag !== 1 && f.tag !== 6)) fail("Master requires ONNX tensor inputs and outputs.");
  const t = fields(bytes(type, 1));
  const shape = buffers(fields(bytes(t, 2)), 1).map(dim => {
    const d = fields(dim);
    if (d.some(f => f.tag !== 1 && f.tag !== 3)) fail("ONNX input and output dimensions must be fixed.");
    return integer(d,1);
  });
  elementCount(shape);
  return [text(bytes(m, 1)), {shape, type: integer(t, 1)}];
}
function equalShape(a: number[], b: number[]) { return a.length === b.length && a.every((v,i) => v === b[i]); }
function broadcast(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);
  return Array.from({length}, (_, i) => {
    const x = a[i - length + a.length] ?? 1, y = b[i - length + b.length] ?? 1;
    if (x !== y && x !== 1 && y !== 1) fail("Incompatible ONNX broadcast dimensions.");
    return Math.max(x, y);
  });
}
function axisIndex(axis: number, rank: number) {
  const index = axis < 0 ? rank + axis : axis;
  if (!Number.isSafeInteger(index) || index < 0 || index >= rank) fail("Invalid ONNX tensor axis.");
  return index;
}
// These feed-forward operators admit fixed, bounded intermediate shapes. Reject
// custom kernels, state, subgraphs and data-dependent allocations before ORT.
const operators: Record<string, [number, number, string[]]> = {
  Constant: [0,0,["value"]], Gather: [2,2,["axis"]], Gemm: [2,3,["alpha","beta","transA","transB"]],
  MatMul: [2,2,[]], Cast: [1,1,["to"]], Elu: [1,1,["alpha"]], LeakyRelu: [1,1,["alpha"]],
  Relu: [1,1,[]], Sigmoid: [1,1,[]], Tanh: [1,1,[]], Identity: [1,1,[]], Neg: [1,1,[]],
  Add: [2,2,[]], Sub: [2,2,[]], Mul: [2,2,[]], Div: [2,2,[]], Clip: [1,3,[]],
  Squeeze: [1,2,["axes"]], Unsqueeze: [1,2,["axes"]], Flatten: [1,1,["axis"]],
  Reshape: [2,2,["allowzero"]], Transpose: [1,1,["perm"]], Concat: [1,64,["axis"]],
};
function nodeTensor(op: string, inputs: (Tensor | undefined)[], attrs: Map<string, Fields>): Tensor {
  function attr(name: string, fallback: number) { return attrs.has(name) ? integer(attrs.get(name)!, 3) : fallback; }
  if (op === "Constant") {
    const value = attrs.get("value");
    if (!value) fail("ONNX Constant requires an inline tensor.");
    return tensor(bytes(value, 5));
  }
  const first = inputs[0];
  if (!first) fail("ONNX node is missing its input.");
  if (op === "Identity") return first;
  const x = first.shape, second = inputs[1], y = second?.shape ?? [];
  let shape = x, type = first.type;
  if (op === "Cast") {
    type = attr("to", 0);
    if (![1,6,7].includes(type)) fail("Unsupported ONNX Cast type.");
  } else if (["Add","Sub","Mul","Div"].includes(op)) {
    if (first.type !== second?.type) fail("Incompatible ONNX arithmetic types.");
    shape = broadcast(x,y);
  } else if (op === "Gemm" || op === "MatMul") {
    if (x.length !== 2 || y.length !== 2 || type !== 1 || second?.type !== 1) fail("Master supports two-dimensional float32 matrix multiplication.");
    const [m,k] = attr("transA",0) ? [x[1],x[0]] : x;
    const [k2,n] = attr("transB",0) ? [y[1],y[0]] : y;
    shape = [m,n];
    if (k !== k2 || m*k*n > 64*1024*1024 || (inputs[2] && !equalShape(broadcast(shape,inputs[2].shape),shape)))
      fail("ONNX matrix dimensions are incompatible or exceed the evaluation limit.");
  } else if (op === "Gather") {
    if (!second || ![6,7].includes(second.type)) fail("ONNX Gather requires integer indices.");
    const axis = axisIndex(attr("axis",0),x.length);
    shape = [...x.slice(0,axis),...y,...x.slice(axis+1)];
  } else if (op === "Squeeze" || op === "Unsqueeze") {
    const axes = attrs.has("axes") ? integers(attrs.get("axes")!,8) : second?.smallIntegers;
    if (!axes && (op === "Unsqueeze" || second)) fail("ONNX axes must be fixed integers.");
    const rank = op === "Squeeze" ? x.length : x.length + (axes?.length ?? 0);
    const indices = new Set(axes?.map(a => axisIndex(a,rank)));
    if (axes && indices.size !== axes.length) fail("Repeated ONNX axis.");
    if (op === "Squeeze") {
      if ([...indices].some(i => x[i] !== 1)) fail("Invalid ONNX squeeze dimensions.");
      shape = x.filter((v,i) => axes ? !indices.has(i) : v !== 1);
    } else {
      let i = 0;
      shape = Array.from({length:rank},(_,d) => indices.has(d) ? 1 : x[i++]);
    }
  } else if (op === "Flatten") {
    const axis = attr("axis",1), split = axis === x.length ? axis : axisIndex(axis,x.length);
    shape = [elementCount(x.slice(0,split)),elementCount(x.slice(split))];
  } else if (op === "Transpose") {
    const perm = attrs.has("perm") ? integers(attrs.get("perm")!,8) : x.map((_,i)=>x.length-1-i);
    if (perm.length !== x.length || new Set(perm).size !== x.length || perm.some(i=>i<0 || i>=x.length)) fail("Invalid ONNX transpose.");
    shape = perm.map(i=>x[i]);
  } else if (op === "Reshape") {
    if (!second?.smallIntegers || attr("allowzero",0) !== 0) fail("ONNX reshape dimensions must be fixed constants.");
    shape = second.smallIntegers.map((v,i)=>v === 0 ? x[i] : v);
    const inferred = shape.indexOf(-1);
    if (inferred !== -1) shape[inferred] = elementCount(x) / elementCount(shape.filter((_,i)=>i!==inferred));
    if (elementCount(shape) !== elementCount(x)) fail("Invalid ONNX reshape.");
  } else if (op === "Concat") {
    const axis = axisIndex(attr("axis",Number.NaN),x.length);
    shape = [...x]; shape[axis] = 0;
    for (const input of inputs) {
      if (!input || input.type !== type || input.shape.length !== x.length || input.shape.some((v,i)=>i!==axis && v!==x[i])) fail("Invalid ONNX concatenation.");
      shape[axis] += input.shape[axis];
    }
  } else if (op === "Clip" && inputs.slice(1).some(t=>t && (elementCount(t.shape)!==1 || t.type!==type))) fail("ONNX Clip limits must be compatible scalars.");
  return {shape,type};
}

function validateUltraInterface(outputs: Map<string,Tensor>, metadata: Map<string,string>) {
  if (metadata.get("joint_names") !== ultraProfile.joint_names.join(",")) fail("Master Ultra requires the native 29-joint order in joint_names.");
  const shapes: Record<string, number[]> = {
    actions: [1,29], joint_pos: [1,29], joint_vel: [1,29], body_pos_w: [1,14,3], body_quat_w: [1,14,4],
    body_lin_vel_w: [1,14,3], body_ang_vel_w: [1,14,3], motion_phase: [1,2],
  };
  if (outputs.size !== Object.keys(shapes).length + Object.keys(ultraProfile.parameters).length) fail("Master Ultra playback requires all 12 native policy outputs.");
  for (const [name,shape] of Object.entries(shapes)) {
    const output = outputs.get(name);
    if (output?.type !== 1 || !equalShape(output.shape,shape)) fail("Invalid Master Ultra output: " + name);
  }
  for (const [name,reference] of Object.entries(ultraProfile.parameters)) {
    const output = outputs.get(name);
    if (output?.type !== 1 || !(equalShape(output.shape,[1,29]) || equalShape(output.shape,[29]))) fail("Invalid Master Ultra parameter output: " + name);
    const values = (metadata.get(name) ?? "").split(",");
    if (values.length !== reference.length || values.some((raw,i) => {
      const n = Number(raw);
      return !raw.trim() || !Number.isFinite(n) || Math.abs(n-reference[i]) > .001;
    })) fail("Master Ultra policy metadata differs from the native controller parameter " + name + ".");
  }
}

export function inspectMasterPolicy(data: Buffer) {
  const model = fields(data), irVersion = integer(model,1);
  if (!Number.isSafeInteger(irVersion) || irVersion < 4 || irVersion > 9 || model.some(f=>![1,2,3,4,5,6,7,8,14].includes(f.tag))) fail("Unsupported ONNX IR, training data, function or extension.");
  const imports = fields(bytes(model,8)), opset = integer(imports,2);
  if (bytes(imports,1,false).length || opset < 11 || opset > 18) fail("Master requires one standard ONNX opset between 11 and 18.");
  const graph = fields(bytes(model,7));
  if (graph.some(f=>![1,2,5,10,11,12,13].includes(f.tag))) fail("Unsupported ONNX sparse or extended graph.");
  const inputList = buffers(graph,11).map(valueInfo), outputList = buffers(graph,12).map(valueInfo);
  const inputs = new Map(inputList), outputs = new Map(outputList);
  const obs = inputs.get("obs"), time = inputs.get("time_step"), acts = outputs.get("actions");
  if (inputList.length!==2 || outputs.size!==outputList.length || outputs.size>64 || !obs || !time || !acts ||
      obs.type!==1 || time.type!==1 || acts.type!==1 || !equalShape(time.shape,[1,1]) ||
      ![131,151].includes(obs.shape[1]) || !equalShape(obs.shape,[1,obs.shape[1]]) ||
      !equalShape(acts.shape,[1,(obs.shape[1]-6)/5])) fail("Expected Master float32 obs [1,151] or [1,131], time_step [1,1] and matching actions [1,29] or [1,25].");
  let frameCount: number | undefined;
  const metadataKeys = new Set<string>();
  const parameters = new Map<string,string>();
  for (const entry of buffers(model,14)) {
    const m = fields(entry), key = text(bytes(m,1));
    if (metadataKeys.has(key)) fail("Duplicate ONNX metadata.");
    metadataKeys.add(key);
    if (key === "joint_names" || Object.hasOwn(ultraProfile.parameters,key)) parameters.set(key,text(bytes(m,2)));
    if (key === "time_step_total") {
      const value = text(bytes(m,2));
      if (!/^[1-9]\d{0,5}$/.test(value)) fail("Invalid ONNX time_step_total.");
      frameCount = Number(value);
    }
  }
  if (obs.shape[1] === 151) validateUltraInterface(outputs,parameters);
  const values = new Map(inputs);
  function define(name: string, value: Tensor) {
    if (values.has(name)) fail("ONNX graph contains a duplicate tensor definition.");
    values.set(name,value);
  }
  for (const init of buffers(graph,5)) define(text(bytes(fields(init),8)),tensor(init));
  const nodes = buffers(graph,1);
  if (!nodes.length || nodes.length > maxNodes) fail("ONNX graph is empty or exceeds the supported node limit.");
  let intermediateElements = 0;
  for (const data of nodes) {
    const node = fields(data), op = text(bytes(node,4));
    if (bytes(node,7,false).length || node.some(f=>![1,2,3,4,5,6,7].includes(f.tag)) || !Object.hasOwn(operators,op)) fail("Master policy contains an unsupported ONNX operator or domain.");
    const [min,max,allowed] = operators[op];
    const names = buffers(node,1);
    if (names.length<min || names.length>max) fail("Invalid ONNX operator input count.");
    const args = names.map((name,i)=>{
      if (!name.length && op === "Clip" && i>0) return undefined;
      const found = values.get(text(name));
      if (!found) fail("ONNX graph references an undefined input.");
      return found;
    });
    const attrs = new Map<string,Fields>();
    for (const encoded of buffers(node,5)) {
      const a = fields(encoded), name = text(bytes(a,1));
      if (!allowed.includes(name) || attrs.has(name)) fail("Unsupported ONNX operator attribute.");
      const kind = name === "value" ? 4 : ["alpha","beta"].includes(name) ? 1 : ["axes","perm"].includes(name) ? 7 : 2;
      const payload = ({1:2,2:3,4:5,7:8} as Record<number,number>)[kind];
      if (integer(a,20)!==kind || a.some(f=>![1,13,20,payload].includes(f.tag))) fail("Unsupported ONNX attribute payload.");
      if (kind===1) {
        const floats = a.filter(f=>f.tag===2);
        if (floats.length!==1 || floats[0].wire!==5 || !Buffer.isBuffer(floats[0].value)) fail("Invalid ONNX float attribute.");
        finiteFloat(floats[0].value,0);
      }
      attrs.set(name,a);
    }
    if (["Squeeze","Unsqueeze"].includes(op) && (opset < 13 ? args.length !== 1 : attrs.has("axes"))) fail("ONNX axes encoding differs from its opset.");
    if (op === "Reshape" && opset < 14 && attrs.has("allowzero")) fail("ONNX allowzero is unavailable in this opset.");
    for (const flag of ["transA","transB"]) {
      if (attrs.has(flag) && ![0,1].includes(integer(attrs.get(flag)!,3))) fail("Invalid ONNX matrix transpose flag.");
    }
    if (["Elu","LeakyRelu","Relu","Sigmoid","Tanh"].includes(op) && args[0]?.type !== 1) fail("Master activation kernels require float32 input.");
    const result = nodeTensor(op,args,attrs);
    intermediateElements += elementCount(result.shape);
    if (intermediateElements>64*1024*1024) fail("ONNX graph intermediate storage exceeds the inspection limit.");
    define(text(bytes(node,2)), result);
  }
  for (const [name,declared] of outputs) {
    const actual = values.get(name);
    if (!actual || actual.type!==declared.type || !equalShape(actual.shape,declared.shape)) fail("ONNX declared output does not match the computed tensor dimensions.");
  }
  const phase = values.get("motion_phase")?.smallFloats;
  if (phase) {
    if (phase.length !== 2 || phase[0] !== 0 || !Number.isInteger(phase[1]) ||
        (frameCount !== undefined && phase[1]+1 !== frameCount)) fail("ONNX motion_phase conflicts with the declared frame count.");
    frameCount = phase[1]+1;
  }
  if (!frameCount || !Number.isInteger(frameCount) || frameCount < 1 || frameCount > maxFrameCount) fail("Declare 1 to 180000 frames at 50 Hz via time_step_total or constant motion_phase.");
  if (obs.shape[1] === 151) {
    for (const [name,reference] of Object.entries(ultraProfile.parameters)) {
      const constant = values.get(name)?.smallFloats;
      if (constant && constant.some((n,i)=>Math.abs(n-reference[i])>.001)) fail("Master Ultra constant differs from native controller parameter " + name + ".");
    }
  }
  const masterContract: MasterPolicyContract = {model:obs.shape[1]===151 ? "Master Ultra" : "Master Edu",
    observationSize:obs.shape[1], actionSize:acts.shape[1], controlHz:50, frameCount, opset, evidence:"static-interface"};
  return {irVersion, inputs:[...inputs.keys()], outputs:[...outputs.keys()], masterContract};
}
