import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerAccountEmail } from "@/lib/server-account-session";
import { getCodeSubmissionRecord } from "@/lib/account-records";
import { assetIdPattern, assetKeyPattern, assetPrefix, ownedAssetFile } from "@/lib/eaic-review-exemption";
import { supabaseRequest } from "@/lib/supabase-server";
import { submissionHref, submissionAssetId } from "@/lib/submission-href";
import { DownloadUpload } from "./download-upload";
import "./submissions.css";
type Params={asset?:string;code?:string;uploads?:string;sources?:string};
type Row={id:string;file_name?:string;uploaded_file_name?:string;robot_model:string;created_at:string};
const home="/account/submissions";
const date=(s:string)=>new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(s));
const size=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
const page=(n?:string)=>/^\d{1,5}$/.test(n??"")?Math.max(1,Number(n)):1;
function recents(rows:Row[],kind:"uploads"|"sources",current:number,other:number) {
 const url=(n:number)=>home+"?"+new URLSearchParams({[kind]:String(n),[kind==="uploads"?"sources":"uploads"]:String(other)});
 return <section className="file-card"><h2>{kind==="uploads"?"Uploaded files":"Code submissions"}</h2>{rows.length===0&&<p>No submissions on this page.</p>}
 {rows.slice(0,3).map(r=>{const name=r.file_name||r.uploaded_file_name||"Website editor.py";return <Link className="file-row" key={r.id} href={kind==="uploads"?home+"?asset="+encodeURIComponent(r.id):submissionHref(r.id)}>
 <span className="file-type">{kind==="uploads"?name.split(".").pop()?.toUpperCase():"CODE"}</span><span><strong>{name}</strong><small>{r.robot_model} · {date(r.created_at)}</small></span><span aria-hidden="true">→</span></Link>})}
 {(current>1||rows.length>3)&&<nav aria-label={kind+" pages"}>{current>1&&<Link href={url(current-1)}>← Newer</Link>}{rows.length>3&&<Link href={url(current+1)}>View previous →</Link>}</nav>}</section>;
}
export default async function Submissions({searchParams}:{searchParams:Promise<Params>}) {
 const p=await searchParams,email=await getServerAccountEmail(undefined,{requireSignedSession:true});
 if(!email)redirect("/login?next="+encodeURIComponent(home+(p.asset?"?asset="+encodeURIComponent(p.asset):p.code?"?code="+encodeURIComponent(p.code):"")));
 const owner="email=eq."+encodeURIComponent(email),isDetail=p.asset!==undefined||p.code!==undefined;let content;
 if(p.asset!==undefined){
 if(!assetIdPattern.test(p.asset))notFound();
 const file=await ownedAssetFile(email,p.asset);if(!file)notFound();
 const {receipt,name}=file,m=receipt.content_manifest;
 const [row]=await supabaseRequest<{object_key:string;created_at:string}[]>("agentech_account_asset_submissions",{query:owner+"&id=eq."+p.asset+"&select=object_key,created_at&limit=1"});
 const prefix=assetPrefix(email)+"/",key=row?.object_key.slice(prefix.length);
 if(!key||!assetKeyPattern.test(key)||row.object_key!==prefix+key||key.slice(0,36)!==p.asset)notFound();
 content=<><p className="file-label">Submitted file</p><h1>{name}</h1><p>{file.robotModel} · {size(receipt.byte_size)} · {date(row.created_at)}</p><section className="file-card"><h2>{name.toLowerCase().endsWith(".zip")?"Package contents":"File details"}</h2>
 {[m?.movement,m?.audio].map(x=>x&&<div className="file-row" key={x.path}><span className="file-type">{x.format.toUpperCase()}</span><span><strong>{x.path}</strong><small>{size(x.bytes)}{x.format==="wav"?" · "+x.durationSeconds.toFixed(1)+" s":""}</small></span></div>)}
 {!!m?.referenceFiles?.length&&<details><summary>Reference files ({m.referenceFiles.length})</summary>{m.referenceFiles.map(x=><p key={x}>{x}</p>)}</details>}
 <div className="file-actions"><DownloadUpload objectKey={key} name={name}/>{m?.movement?.metadata.masterContract?.model==="Master Ultra"&&<Link href={"/agentech-products/eaic-hub/schedule-time?nativeAssetId="+p.asset}>Schedule this motion →</Link>}</div></section></>;
 }else if(p.code!==undefined){
 if(!p.code||p.code.length>180)notFound();const r=await getCodeSubmissionRecord(p.code,email);if(!r)notFound();if(submissionAssetId(r.id))redirect(submissionHref(r.id));
 content=<><p className="file-label">Submitted code</p><h1>{r.uploaded_file_name||"Website editor.py"}</h1><p>{r.robot_model} · {date(r.created_at)}</p><section className="file-card"><h2>Saved source</h2><pre><code>{r.code}</code></pre></section></>;
 }else{
 const u=page(p.uploads),s=page(p.sources);const [uploads,codes]=await Promise.all([
 supabaseRequest<Row[]>("agentech_account_asset_submissions",{query:owner+"&select=id,file_name,robot_model,created_at&order=created_at.desc,id.desc&limit=4&offset="+(u-1)*3}),
 supabaseRequest<Row[]>("agentech_code_submissions",{query:owner+"&id=not.like.master-body-*&select=id,uploaded_file_name,robot_model,created_at&order=created_at.desc,id.desc&limit=4&offset="+(s-1)*3})]);
 content=<><p className="file-label">Your account</p><h1>My submissions</h1><p>Open an original upload or the code saved with a specific submission.</p><div className="file-grid">{recents(uploads,"uploads",u,s)}{recents(codes,"sources",s,u)}</div></>;
 }
 return <main data-my-submissions><div><Link href={isDetail?home:"/account"}>← {isDetail?"My submissions":"Account"}</Link>{content}</div></main>;
}
