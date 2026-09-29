"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BuyerWorkspaceData, ServiceProfile, ServiceProfileType } from "@/lib/data-collection";
import { ServiceProfileForm } from "./service-profile-form";
import { DataIcon } from "./icon";

export function ServiceProfiles({ preview, localMode, accountEmail, initialType }: { preview: boolean; localMode: boolean; accountEmail: string; initialType: ServiceProfileType }) {
  const [data, setData] = useState<BuyerWorkspaceData>({ profile: null, briefs: [] });
  const [type, setType] = useState(initialType);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const endpoint = `/api/service-profiles${preview ? "?preview=1" : ""}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try { const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result.data); }
      catch (error) { if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "Could not load profiles."); setLoadFailed(true); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [endpoint]);
  async function save(profile: ServiceProfile) {
    setBusy(true); setError(""); setSaved(false);
    try { const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile", profile }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result.data); setSaved(true); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save your profile."); }
    finally { setBusy(false); }
  }
  const current = type === "data-buyer" ? data.profile : data.developmentProfile;
  return <div className="dc-profile-page dc-container"><div className="dc-profile-page-top"><Link href="/account" className="dc-text-link">← Account</Link><span>{accountEmail}</span></div><div className="dc-eyebrow">ONE ACCOUNT. MORE POSSIBILITIES.</div><h1>Your work starts here.</h1><p className="dc-profile-intro">Choose what you need. Create a profile in a few seconds.</p>
    {localMode && <div className="dc-preview-banner"><span className="dc-dot" />Local preview · Profile changes are saved on this computer.</div>}
    <div className="dc-profile-choices">{([{ type: "data-buyer", title: "Data Collection Buyer", description: "Source data and plan collection projects.", icon: "layers" }, { type: "development-client", title: "App / Website Client", description: "Bring your website or app project to Agentech.", icon: "grid" }] as const).map((item) => <button key={item.type} aria-pressed={type === item.type} disabled={busy} onClick={() => { setType(item.type); setSaved(false); setError(""); }}><DataIcon name={item.icon} size={27} /><div><strong>{item.title}</strong><p>{item.description}</p></div>{(item.type === "data-buyer" ? data.profile : data.developmentProfile) ? <span className="dc-pill">CREATED</span> : <span className="dc-choice-radio" />}</button>)}</div>
    {error && <div role="alert" className="dc-alert dc-alert-error">{error}{loadFailed && <button className="dc-button dc-secondary" onClick={() => window.location.reload()}>Try again</button>}</div>}
    {saved && <div className="dc-alert dc-alert-success" role="status"><DataIcon name="check" size={20} />Your profile is ready.<Link href={type === "data-buyer" ? `/data-collection/workspace${preview ? "?preview=1" : ""}` : "/ai-service"} className="dc-text-link">{type === "data-buyer" ? "Open buyer workspace" : "Explore website & app services"}<DataIcon name="arrow" size={17} /></Link></div>}
    {loading ? <div className="dc-empty" role="status">Loading your profiles…</div> : !loadFailed && <ServiceProfileForm key={type} type={type} initial={current ?? (type === "data-buyer" ? data.developmentProfile : data.profile)} busy={busy} onSave={save} />}
    <p className="dc-profile-footnote">No separate password. No application review to create a profile. You can have both.</p>
  </div>;
}
