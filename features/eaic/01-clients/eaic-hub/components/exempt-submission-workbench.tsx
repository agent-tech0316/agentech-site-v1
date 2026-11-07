"use client";

import Link from "next/link";
import dance from "@/scripts/master-happy-dance.json";
import { useCallback, useEffect, useRef, useState } from "react";
import { robotModelOptions, type AgentechRobotModel } from "@/lib/agentech-robot-model";
import { getEaicHubTaskPath } from "../contracts/eaic-hub";
import type { AssetContentManifest } from "@/lib/eaic-asset-content";
import styles from "./asset-contents.module.css";

type Receipt = {id:string; sha256:string; native_motion_name:string|null; content_manifest:AssetContentManifest|null};
type Asset = { key: string; name: string; kind: string; bytes?: number; receipt:Receipt|null };
type Props = {
  initialCode: string; initialModel: AgentechRobotModel; initialFile: string;
  schedulable: boolean; onViewOnly?: () => void;
};
const panel = "rounded-2xl border border-black/10 bg-white p-5 text-[#202124] dark:border-white/15 dark:bg-[#18212b] dark:text-[#eaf2fd]";
const button = "rounded-full border border-[#1a73e8] bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

async function post(url: string, body: object) {
  const response = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function ExemptSubmissionWorkbench({initialCode,initialModel,initialFile,schedulable,onViewOnly}: Props) {
  const [code,setCode] = useState(initialCode);
  const [model,setModel] = useState(initialModel);
  const [filename,setFilename] = useState(initialFile);
  const [saved,setSaved] = useState(schedulable);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [files,setFiles] = useState<Asset[]>([]);
  const [nextOffset,setNextOffset] = useState<number|null>(null);
  const latestList = useRef(0);
  const loadFiles = useCallback(async (offset = 0) => {
    const seq = ++latestList.current;
    const response = await fetch(`/api/eaic-account-assets?offset=${offset}`, {cache:"no-store"});
    if (!response.ok) throw new Error("Could not load your files.");
    const data = await response.json() as {files:Asset[];nextOffset:number|null};
    if (seq === latestList.current) {
      setFiles(old=>offset ? [...old,...data.files] : data.files);
      setNextOffset(data.nextOffset);
    }
  },[]);
  useEffect(()=>{
    void loadFiles().catch((err:Error)=>setMessage(err.message));
    return ()=>{ latestList.current++; };
  },[loadFiles]);
  async function act(work:()=>Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); } catch(err) { setMessage(err instanceof Error ? err.message : "Request failed."); }
    finally { setBusy(false); }
  }
  async function saveProgram() {
    const result = await post("/api/agentech-code-submit", {reviewStage:"account_exempt",robotModel:model,
      code,uploadedFileName:filename,runMode:"Software check"});
    if (result.approvalBasis !== "account-certification-exemption") throw new Error("The program was not saved with this account’s exemption.");
    setSaved(true); setMessage("Program saved. Both submission gates are approved by account exemption.");
  }
  async function upload(file: File) {
    if (file.size>64*1024*1024) throw new Error("Choose a file smaller than 64 MiB.");
    const signed = await post("/api/eaic-account-assets",{action:"upload",name:file.name,robotModel:model});
    const response = await fetch(signed.url,{method:"PUT",body:file,headers:{"Content-Type":"application/octet-stream"}});
    if (!response.ok) {
      const detail = await response.json().catch(()=>null);
      throw new Error(detail?.message || "Upload failed. Please retry.");
    }
    try {
      const {receipt} = await post("/api/eaic-account-assets",{action:"submit",key:signed.key}) as {receipt:Receipt};
      const contents=receipt.content_manifest;
      setMessage(contents?.movement && contents.audio
        ? `${file.name}: movement policy and audio identified and paired. Submission saved.`
        : `${signed.kind} submitted and approved: ${file.name}`);
    } finally { await loadFiles(); }
  }
  return <section aria-label="Account-exempt submissions" className="mx-auto grid max-w-6xl gap-5 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div className={panel}>
      <h2 className="text-xl font-semibold">Program for scheduling</h2>
      <p className="my-3 text-sm">Your account automatically passes Command / Hardware Check and Software Check.</p>
      <label className="block text-sm font-semibold">Robot model
        <select disabled={busy} className="ml-3 rounded border bg-transparent p-2" value={model}
          onChange={e=>{setModel(e.target.value as AgentechRobotModel);setSaved(false);}}>
          {robotModelOptions.map(m=><option key={m}>{m}</option>)}
        </select>
      </label>
      <label className="my-3 block text-sm">Open a Python or text file
        <input disabled={busy} type="file" accept=".py,.txt" className="mt-1 block w-full" onChange={e=>{
          const file=e.currentTarget.files?.[0]; e.currentTarget.value="";
          if(file) void act(async()=>{setCode(await file.text());setFilename(file.name);setSaved(false);});
        }}/>
      </label>
      <textarea aria-label="Python code submission editor" spellCheck={false} disabled={busy} value={code}
        onChange={e=>{setCode(e.target.value);setSaved(false);}}
        className="my-2 min-h-64 w-full rounded-lg border border-current/25 bg-transparent p-3 font-mono text-sm"/>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button className={button} disabled={busy || !code.trim() || saved} onClick={()=>void act(saveProgram)}>
          {saved ? "Program saved" : "Save program for scheduling"}
        </button>
        {saved && <Link className="font-semibold underline" href={getEaicHubTaskPath("schedule-time")}>Request Time Slot</Link>}
        {onViewOnly && <button className="text-sm underline" onClick={onViewOnly} disabled={busy}>Master camera-only test</button>}
      </div>
    </div>
    <div className={panel}>
      <h2 className="text-xl font-semibold">File submissions</h2>
      <p data-asset-zip-help className="mt-2 text-sm leading-6">Upload a ZIP and EAIC identifies the ONNX movement policy and WAV audio, then keeps them paired. Include one policy and up to one audio track.</p>
      <label className="my-3 block text-sm">Submit a ZIP package, ONNX motion, or WAV audio file for {model}
        <input aria-label="Upload movement and audio package" disabled={busy} type="file" accept=".zip,.onnx,.wav" className="mt-2 block w-full"
          onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file) void act(()=>upload(file));}}/>
      </label>
      <ul className="divide-y divide-current/15">{files.map(file=><li key={file.key} className="py-2">
        <span className="block text-xs">{file.kind}</span>
        <button className="break-all text-left text-sm underline" disabled={busy} onClick={()=>void act(async()=>{
          const signed=await post("/api/eaic-account-assets",{action:"download",key:file.key});
          const link=document.createElement("a"); link.href=signed.url; link.download=file.name;link.click();
        })}>{file.name}</button>
        {file.kind === "Package" && file.receipt?.sha256 === dance.zip && file.receipt.native_motion_name === dance.motion &&
          <Link className="my-2 block font-semibold underline" href={getEaicHubTaskPath("schedule-time")+"?nativeAssetId="+file.receipt.id}>Schedule Happy Dance with audio</Link>}
        {file.receipt?.content_manifest && <AssetContents manifest={file.receipt.content_manifest}/>}
        {file.receipt ? <details className="mt-1 text-xs">
          <summary>Approved · Submission receipt</summary>
          <p className="my-1 break-all">ID: {file.receipt.id}</p>
          {file.receipt.native_motion_name && <p className="my-1 break-all">Master motion: {file.receipt.native_motion_name}</p>}
          <p className="break-all font-mono">SHA-256: {file.receipt.sha256}</p>
        </details> : null}
        {file.receipt && !file.receipt.content_manifest && <p className="mt-1 text-xs">Contents have not been identified yet.</p>}
        {!file.receipt?.content_manifest && <button disabled={busy} className="ml-2 underline" onClick={()=>void act(async()=>{
          await post("/api/eaic-account-assets",{action:"submit",key:file.key}); await loadFiles();
        })}>{file.receipt ? "Identify contents" : "Finish submission"}</button>}
      </li>)}</ul>
      {nextOffset !== null && <button className="mt-2 underline" disabled={busy} onClick={()=>void act(()=>loadFiles(nextOffset))}>More files</button>}
    </div>
    <p className="text-sm lg:col-span-2" role="status">{busy ? "Working…" : message}</p>
  </section>;
}

function AssetContents({manifest}:{manifest:AssetContentManifest}) {
  return <div data-asset-contents className={`${styles.contents} my-3 rounded-xl border p-3 text-sm`}>
    <dl className="space-y-3">
      {manifest.movement && <div><dt className="font-semibold">Movement · ONNX</dt>
        <dd className="break-all">{manifest.movement.path}</dd></div>}
      {manifest.audio && <div><dt className="font-semibold">Audio · WAV</dt>
        <dd className="break-all">{manifest.audio.path}</dd>
        <dd className="text-xs">{manifest.audio.durationSeconds.toFixed(1)} s · {manifest.audio.sampleRateHz.toLocaleString()} Hz · {manifest.audio.channels === 1 ? "Mono" : `${manifest.audio.channels} channels`}</dd></div>}
    </dl>
    <p className="mt-3 text-xs">{manifest.playback.mode === "movement_with_audio" ? "Movement and audio paired in this package."
      : manifest.movement ? "Movement only · no audio included." : "Audio only · no movement included."}</p>
    <p className="mt-2 text-xs opacity-75">File identification does not verify playback on the robot.</p>
  </div>;
}
