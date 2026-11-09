"use client";
import { useState } from "react";
export function DownloadUpload({objectKey, name}: {objectKey:string;name:string}) {
  const [busy,setBusy]=useState(false), [error,setError]=useState(false);
  async function download() {
    setBusy(true);setError(false);
    try {
      const r=await fetch("/api/eaic-account-assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"download",key:objectKey})});
      if(!r.ok) throw Error();
      const {url}=await r.json();const a=document.createElement("a");a.href=url;a.download=name;a.click();
    }catch{setError(true)}finally{setBusy(false)}
  }
  return <><button className="file-action" type="button" disabled={busy} onClick={download}>{busy?"Preparing download…":"Download original"}</button>{error&&<p role="alert">The file could not be downloaded. Try again.</p>}</>;
}
