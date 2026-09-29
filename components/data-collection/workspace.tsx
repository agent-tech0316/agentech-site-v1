"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { collectionScenarios, collectionModalities, collectionFormats, type BuyerWorkspaceData, type CollectionBrief } from "@/lib/data-collection";
import { DataIcon } from "./icon";
import { ServiceProfileForm } from "./service-profile-form";

type View = "overview" | "projects" | "profile" | "new";
const navigation = [{ id: "overview", label: "Overview", icon: "grid" }, { id: "projects", label: "My projects", icon: "folder" }, { id: "profile", label: "Buyer profile", icon: "profile" }] as const;

export function BuyerWorkspace({ preview, localMode, accountEmail, initialView, initialScenario }: { preview: boolean; localMode: boolean; accountEmail: string; initialView: string; initialScenario: string }) {
  const [view, setView] = useState<View>(initialView === "new" ? "new" : "overview");
  const [data, setData] = useState<BuyerWorkspaceData>({ profile: null, briefs: [] });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedBrief, setSelectedBrief] = useState<CollectionBrief | null>(null);
  const [scenario, setScenario] = useState(collectionScenarios.some((item) => item.id === initialScenario) ? initialScenario : "manufacturing");
  const endpoint = `/api/data-collection${preview ? "?preview=1" : ""}`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load your workspace.");
        setData(result.data);
      } catch (error) {
        if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "Could not load your workspace."); setLoadFailed(true); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [endpoint]);

  function navigate(next: View) { setView(next); setError(""); setMessage(""); setSelectedBrief(null); }
  async function save(payload: unknown) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your changes could not be saved.");
      setData(result.data);
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Your changes could not be saved."); return false; }
    finally { setBusy(false); }
  }
  async function saveBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (await save({ action: "brief", brief: { ...values, scenario, quantity: Number(values.quantity) } })) {
      setView("projects");
      setMessage(localMode ? "Project brief saved as a local draft. No request has been sent." : "Project brief saved. No collection request has been sent.");
    }
  }
  function downloadBrief(brief: CollectionBrief) {
    const blob = new Blob([JSON.stringify({ buyer: data.profile, project: brief }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `collection-brief-${brief.id.slice(0, 8)}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="dc-workspace">
    <aside className="dc-sidebar"><Link href="/data-collection" className="dc-workspace-brand"><span><DataIcon name="layers" size={24} /></span><div>Data collection<small>BUYER WORKSPACE</small></div></Link><div className="dc-organization"><span className="dc-avatar">{data.profile?.organization.slice(0, 1).toUpperCase() || "B"}</span><div><strong>{data.profile?.organization || "Your organization"}</strong><span>Data collection buyer</span></div></div><span className="dc-nav-caption">WORKSPACE</span><nav aria-label="Buyer workspace">{navigation.map((item) => <button key={item.id} aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><DataIcon name={item.icon} size={19} />{item.label}{item.id === "projects" && <span className="dc-count">{data.briefs.length}</span>}</button>)}<Link href="/data-collection#scenarios"><DataIcon name="scan" size={19} />Explore scenarios<DataIcon name="arrow" size={15} /></Link></nav><div className="dc-sidebar-note"><DataIcon name="shield" size={23} /><strong>One account. Your workspace.</strong><p>A separate buyer profile for your data projects, connected to your Agentech account.</p><Link href="/account">Manage Agentech account <DataIcon name="arrow" size={14} /></Link></div><div className="dc-sidebar-account"><span className="dc-avatar dc-avatar-small"><DataIcon name="profile" size={16} /></span><span>{accountEmail}<small>{preview ? "Preview workspace" : "Agentech account"}</small></span></div></aside>
    <div className="dc-workspace-main"><div className="dc-workspace-topbar"><span>Data collection <span>/</span> {view === "new" ? "New project" : navigation.find((item) => item.id === view)?.label}</span><span className="dc-pill">BUYER</span></div>{localMode && <div className="dc-preview-banner"><span className="dc-dot" /><span><strong>Local preview</strong> · Profiles and drafts are saved on this computer. Collection requests are not sent.</span></div>}<div className="dc-workspace-content">
      <div className="dc-workspace-heading"><div><div className="dc-eyebrow">YOUR DATA, WITH DIRECTION</div><h1>{view === "profile" ? "Buyer profile" : view === "projects" ? "Your collection projects" : view === "new" ? "Define your next dataset." : "Your next dataset starts here."}</h1><p>{view === "profile" ? "Help us understand your organization and who we’re working with." : view === "projects" ? "Keep your requirements and collection briefs in one place." : view === "new" ? "Tell us what you want to capture. Start with the essentials." : "A dedicated space to turn your model’s needs into a clear collection plan."}</p></div>{view !== "new" && view !== "profile" && <button onClick={() => navigate("new")} className="dc-button dc-primary" disabled={loading || loadFailed}><DataIcon name="plus" size={18} />New project</button>}</div>
      {error && <div className="dc-alert dc-alert-error" role="alert">{error}{loadFailed && <button className="dc-button dc-secondary" onClick={() => window.location.reload()}>Try again</button>}</div>}
      {message && <div className="dc-alert dc-alert-success" role="status"><DataIcon name="check" size={19} />{message}</div>}
      {loading ? <div className="dc-empty" role="status">Loading your buyer workspace…</div> : loadFailed ? null : <>
        {view === "overview" && <>
          <div className="dc-metrics"><div><span>BUYER PROFILE</span><strong>{data.profile ? "Ready" : "Let’s set up"}</strong><p>{data.profile ? data.profile.organization : "Create your dedicated profile"}</p></div><div><span>PROJECT BRIEFS</span><strong className="dc-mono">{String(data.briefs.length).padStart(2, "0")}</strong><p>Drafts in your workspace</p></div><div><span>YOUR NEXT STEP</span><strong>{data.profile ? "Define a project" : "Introduce yourself"}</strong><p>{data.profile ? "Specify the data your model needs" : "Add your organization details"}</p></div></div>
          <section className="dc-get-started"><div className="dc-get-started-copy"><span className="dc-eyebrow">LET’S GET YOU STARTED</span><h2>A little context.<br />A better collection.</h2><p>{data.profile ? "Your buyer profile is ready. Build a project brief to define the tasks, coverage, and data your model needs." : "Set up your buyer profile once, then use it across every collection project."}</p><button className="dc-button dc-primary" onClick={() => navigate(data.profile ? "new" : "profile")}>{data.profile ? "Create a project brief" : "Create buyer profile"}<DataIcon name="arrow" size={18} /></button></div><div className="dc-onboarding-steps">{[["Your buyer profile", "Organization and primary contact", !!data.profile], ["Your collection brief", "Scenario, modalities, and target volume", data.briefs.length > 0], ["Your project review", "Agree on scope and acceptance criteria", false]].map(([title, description, done], index) => <div key={String(title)} className={done ? "is-complete" : ""}><span>{done ? <DataIcon name="check" size={19} /> : `0${index + 1}`}</span><div><strong>{title}</strong><p>{description}</p></div><small>{done ? "COMPLETE" : index === 2 ? "NEXT PHASE" : "TO DO"}</small></div>)}</div></section>
          <div className="dc-section-heading dc-workspace-section-heading"><div><h2>Start with a scenario</h2><p>A starting point for your next collection brief.</p></div><Link href="/data-collection#scenarios" className="dc-text-link">View all scenarios <DataIcon name="arrow" size={16} /></Link></div><div className="dc-workspace-scenarios">{collectionScenarios.slice(0, 3).map((item) => <button key={item.id} onClick={() => { setScenario(item.id); navigate("new"); }}><DataIcon name={item.icon} size={30} /><strong>{item.name}</strong><p>{item.description}</p><span>Create a brief <DataIcon name="arrow" size={16} /></span></button>)}</div>
        </>}
        {view === "profile" && <div className="dc-form-layout"><div><ServiceProfileForm type="data-buyer" initial={data.profile} busy={busy} onSave={async (profile) => { if (await save({ action: "profile", profile })) setMessage("Buyer profile saved. You’re ready to create a collection brief."); }} />{data.profile && <button className="dc-button dc-primary dc-after-save" onClick={() => navigate("new")}>Create a project brief <DataIcon name="arrow" size={17} /></button>}</div><aside className="dc-form-help"><DataIcon name="shield" size={28} /><h3>Your account. Your profiles.</h3><p>Use the same Agentech sign-in for data collection and development projects.</p><Link href={`/account/service-profiles?type=development-client${preview ? "&preview=1" : ""}`} className="dc-text-link dc-after-save">App / Website Client profile <DataIcon name="arrow" size={16} /></Link></aside></div>}
        {view === "new" && <>
          {!data.profile && <div className="dc-profile-reminder"><DataIcon name="profile" size={23} /><div><strong>First, introduce your organization.</strong><p>Create your buyer profile to save a collection brief.</p></div><button className="dc-button dc-secondary" onClick={() => navigate("profile")}>Create buyer profile <DataIcon name="arrow" size={16} /></button></div>}
          <div className="dc-form-layout"><form className="dc-form-panel" onSubmit={saveBrief}><div className="dc-panel-heading"><DataIcon name="folder" /><div><h2>Collection brief</h2><p>A clear starting point. Details can be refined during project review.</p></div></div><div className="dc-form-grid"><label className="dc-full-width">Project name <span>*</span><input name="title" required maxLength={120} placeholder="e.g. Everyday object manipulation" /></label><label className="dc-full-width">Collection scenario <span>*</span><select value={scenario} onChange={(event) => setScenario(event.target.value)}>{collectionScenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Data modality <span>*</span><select name="modality">{collectionModalities.map((item) => <option key={item}>{item}</option>)}</select></label><label>Delivery format <span>*</span><select name="format">{collectionFormats.map((item) => <option key={item}>{item}</option>)}</select></label><label>Target volume <span>*</span><input name="quantity" type="number" min="1" max="1000000" step="1" required placeholder="100" /></label><label>Volume unit <span>*</span><select name="unit"><option value="hours">Hours</option><option value="episodes">Episodes</option></select></label><label className="dc-full-width">Tasks & requirements<textarea name="notes" rows={5} maxLength={3000} placeholder="Describe the tasks, environments, object variety, annotations, and quality criteria you have in mind." /><small>Include any preferred capture specifications or usage requirements.</small></label></div><div className="dc-form-footer"><button type="button" className="dc-button dc-secondary" onClick={() => navigate("projects")}>Cancel</button><button className="dc-button dc-primary" disabled={busy || !data.profile}>{busy ? "Saving…" : "Save project brief"}<DataIcon name="arrow" size={17} /></button></div></form><aside className="dc-form-help"><span className="dc-eyebrow">A STRONG BRIEF INCLUDES</span><h3>Start with the task.<br />Define the outcome.</h3><ol><li><strong>What should the model learn?</strong><p>Describe a specific action or behavior.</p></li><li><strong>Where does it need to work?</strong><p>List environments and useful variations.</p></li><li><strong>What makes data acceptable?</strong><p>Specify success criteria and exclusions.</p></li></ol><div className="dc-help-note">Saving a draft does not place an order or commit you to a purchase.</div></aside></div>
        </>}
        {view === "projects" && <>
          {!data.briefs.length ? <div className="dc-empty dc-empty-projects"><span className="dc-empty-icon"><DataIcon name="folder" size={35} /></span><h2>A new dataset starts with a good brief.</h2><p>Your collection projects will appear here.<br />Start by defining the task your model needs to learn.</p><button className="dc-button dc-primary" onClick={() => navigate("new")}>Create your first project <DataIcon name="plus" size={18} /></button></div> : <div className="dc-project-list">{data.briefs.map((brief) => <button key={brief.id} className="dc-project-row" onClick={() => setSelectedBrief(selectedBrief?.id === brief.id ? null : brief)} aria-expanded={selectedBrief?.id === brief.id}><span className="dc-project-icon"><DataIcon name={collectionScenarios.find((item) => item.id === brief.scenario)?.icon} /></span><span><strong>{brief.title}</strong><small>{collectionScenarios.find((item) => item.id === brief.scenario)?.name} · {brief.modality}</small></span><span className="dc-project-volume">{brief.quantity.toLocaleString()}<small>{brief.unit}</small></span><span className="dc-pill">DRAFT</span><DataIcon name="arrow" size={18} /></button>)}</div>}
          {selectedBrief && <section className="dc-brief-detail"><div className="dc-panel-heading"><div><span className="dc-eyebrow">PROJECT BRIEF</span><h2>{selectedBrief.title}</h2></div><button onClick={() => downloadBrief(selectedBrief)} className="dc-button dc-secondary"><DataIcon name="download" size={16} />Export brief</button></div><dl><div><dt>Scenario</dt><dd>{collectionScenarios.find((item) => item.id === selectedBrief.scenario)?.name}</dd></div><div><dt>Volume</dt><dd>{selectedBrief.quantity.toLocaleString()} {selectedBrief.unit}</dd></div><div><dt>Modality</dt><dd>{selectedBrief.modality}</dd></div><div><dt>Format</dt><dd>{selectedBrief.format}</dd></div></dl><h3>Tasks & requirements</h3><p className="dc-brief-notes">{selectedBrief.notes || "No additional requirements yet."}</p><div className="dc-help-note">{localMode ? "Local draft" : "Draft"} · Project scope, pricing, and a collection agreement have not been confirmed.</div></section>}
        </>}
      </>}
    </div></div>
  </div>;
}
