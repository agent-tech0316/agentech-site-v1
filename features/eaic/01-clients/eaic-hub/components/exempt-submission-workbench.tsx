"use client";

import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";
import { robotModelOptions, type AgentechRobotModel } from "@/lib/agentech-robot-model";
import { getEaicHubTaskPath } from "../contracts/eaic-hub";
import type { AssetContentManifest } from "@/lib/eaic-asset-content";
import styles from "./exempt-submission-workbench.module.css";
import { EaicTaskCard } from "./eaic-task-card";

type Receipt = {id:string; sha256:string; native_motion_name:string|null; approval_basis:string; content_manifest:AssetContentManifest|null};
type Asset = { key: string; name: string; kind: string; bytes?: number; receipt:Receipt|null };
function hasBookableMotion(file: Asset) {
  const receipt = file.receipt;
  if (!receipt?.content_manifest?.movement) return false;
  const model = receipt.content_manifest.movement.metadata?.masterContract?.model;
  if (model === "Master Edu") return false;
  return receipt.approval_basis === "master-policy-contract-v1" ||
    (receipt.approval_basis === "account-certification-exemption" && file.key.includes("--Master--"));
}

type Props = {
  initialCode: string; initialModel: AgentechRobotModel; initialFile: string;
  schedulable: boolean; motionOnly?: boolean; onViewOnly?: () => void;
};

async function post(url: string, body: object) {
  const response = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function ExemptSubmissionWorkbench({initialCode,initialModel,initialFile,schedulable,motionOnly = false,onViewOnly}: Props) {
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
    const signed = await post("/api/eaic-account-assets",{action:"upload",name:file.name,bytes:file.size,robotModel:model});
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
        : `${file.name}: submission saved.`);
    } finally { await loadFiles(); }
  }
  return <section aria-label={motionOnly ? "Master motion uploads" : "Account-exempt submissions"} className="bg-[#f5f4f1] px-4 py-10 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl">
      <EaicTaskCard>
        <div className={`${styles.form} grid min-w-0 items-start gap-6 ${motionOnly ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"}`}>
          {!motionOnly && <div className="min-w-0">
            <h2 className="text-xl font-semibold">Program for scheduling</h2>
            <p className={`${styles.help} my-3 text-sm`}>Your account automatically passes Command / Hardware Check and Software Check.</p>
            <label className="block text-sm font-semibold">Robot model
              <select disabled={busy} className="ml-3 rounded border p-2" value={model}
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
            <textarea aria-label="Python code submission editor" placeholder="Type or paste Python code" spellCheck={false} disabled={busy} value={code}
              onChange={e=>{setCode(e.target.value);setSaved(false);}}
              className="my-2 min-h-64 w-full rounded-lg border p-3 font-mono text-sm"/>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button className={`${styles.saveButton} rounded-full border px-4 py-2 text-sm font-semibold`} disabled={busy || !code.trim() || saved} onClick={()=>void act(saveProgram)}>
                {saved ? "Program saved" : "Save program for scheduling"}
              </button>
              {saved && <Link className={styles.action} href={getEaicHubTaskPath("schedule-time")}>Request Time Slot</Link>}
              {onViewOnly && <button className="text-sm underline" onClick={onViewOnly} disabled={busy}>Master camera-only test</button>}
            </div>
          </div>}
          <div className="min-w-0 rounded-2xl border border-black/8 bg-[#faf9f6] p-4">
            <h2 className="text-xl font-semibold">File submissions</h2>
            <p data-asset-zip-help className="mt-2 text-sm leading-6">Upload a ZIP and EAIC identifies the ONNX movement policy and WAV audio, then keeps them paired. Include one policy and up to one audio track.</p>
            <label className="my-3 block text-sm">{motionOnly ? "Submit a ZIP package or ONNX motion for Master" : `Submit a ZIP package, ONNX motion, or WAV audio file for ${model}`}
              <input aria-label="Upload movement and audio package" disabled={busy} type="file" accept={motionOnly ? ".zip,.onnx" : ".zip,.onnx,.wav"} className="mt-2 block w-full"
                onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file) void act(()=>upload(file));}}/>
            </label>
            <ul className="divide-y divide-current/15">{files.map(file=><li key={file.key} className="py-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">{file.kind}</span>
              <button className="break-all text-left text-sm underline" disabled={busy} onClick={()=>void act(async()=>{
                const signed=await post("/api/eaic-account-assets",{action:"download",key:file.key});
                const link=document.createElement("a"); link.href=signed.url; link.download=file.name;link.click();
              })}>{file.name}</button>
              {file.receipt && hasBookableMotion(file) &&
                <div className="mt-3"><Link className={styles.action} href={getEaicHubTaskPath("schedule-time")+"?nativeAssetId="+file.receipt.id}>Schedule this motion</Link></div>}
              {file.receipt?.content_manifest?.movement?.metadata?.masterContract?.model === "Master Edu" &&
                <p className="mt-2 text-sm">This motion targets Master Edu. The available robot is Master Ultra.</p>}
              {file.receipt?.content_manifest && <AssetContents manifest={file.receipt.content_manifest}/>}
              {file.receipt ? <details className="mt-1 text-xs">
                <summary>Approved · Submission receipt</summary>
                <p className="my-1 break-all">ID: {file.receipt.id}</p>
                {file.receipt.native_motion_name && <p className="my-1 break-all">Master motion: {file.receipt.native_motion_name}</p>}
                <p className="break-all font-mono">SHA-256: {file.receipt.sha256}</p>
              </details> : null}
              {file.receipt && !file.receipt.content_manifest && <p className="mt-1 text-xs">Contents have not been identified yet.</p>}
              {(!file.receipt?.content_manifest || (file.key.includes("--Master--") && file.receipt.content_manifest.movement
                && file.receipt.approval_basis !== "master-policy-contract-v1")) && <button disabled={busy} className="ml-2 underline" onClick={()=>void act(async()=>{
                await post("/api/eaic-account-assets",{action:"submit",key:file.key}); await loadFiles();
              })}>{file.receipt ? "Check files" : "Finish submission"}</button>}
            </li>)}</ul>
            {nextOffset !== null && <button className="mt-2 underline" disabled={busy} onClick={()=>void act(()=>loadFiles(nextOffset))}>More files</button>}
          </div>
        </div>
        <p className="mt-3 text-sm text-[#526174] empty:hidden" role="status">{busy ? "Working…" : message}</p>
      </EaicTaskCard>
    </div>
  </section>;
}

function AssetContents({manifest}:{manifest:AssetContentManifest}) {
  return <div data-asset-contents className="my-3 rounded-xl border border-black/8 bg-white p-3 text-sm">
    <dl className="space-y-3">
      {manifest.movement && <div><dt className="font-semibold">Movement · ONNX</dt>
        <dd className="break-all">{manifest.movement.path}</dd></div>}
      {manifest.audio && <div><dt className="font-semibold">Audio · WAV</dt>
        <dd className="break-all">{manifest.audio.path}</dd>
        <dd className="text-xs">{manifest.audio.durationSeconds.toFixed(1)} s · {manifest.audio.sampleRateHz.toLocaleString()} Hz · {manifest.audio.channels === 1 ? "Mono" : `${manifest.audio.channels} channels`}</dd></div>}
    </dl>
    <p className="mt-3 text-xs">{manifest.playback.mode === "movement_with_audio" ? "Movement and audio paired in this package."
      : manifest.movement ? "Movement only · no audio included." : "Audio only · no movement included."}</p>
    <p className="mt-2 text-xs">File identification does not verify playback on the robot.</p>
  </div>;
}
