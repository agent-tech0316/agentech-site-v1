"use client";

import { FormEvent, useState } from "react";
import { type ServiceProfile, type ServiceProfileType } from "@/lib/data-collection";
import { DataIcon } from "./icon";

export function ServiceProfileForm({ type, initial, busy, onSave }: { type: ServiceProfileType; initial?: ServiceProfile | null; busy: boolean; onSave: (profile: ServiceProfile) => Promise<void> }) {
  const [organization, setOrganization] = useState(initial?.organization ?? "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSave({ profileType: type, organization, contactName, role, region }); }
  return <form className="dc-form-panel" onSubmit={submit}>
    <div className="dc-panel-heading"><DataIcon name={type === "data-buyer" ? "layers" : "grid"} /><div><h2>{type === "data-buyer" ? "Data Collection Buyer" : "App / Website Client"}</h2><p>Two details and you’re ready. Everything else can wait.</p></div></div>
    <div className="dc-form-grid"><label>Organization or project name <span>*</span><input required maxLength={120} autoComplete="organization" placeholder="Company, lab, or your project" value={organization} onChange={(event) => setOrganization(event.target.value)} /></label><label>Contact name <span>*</span><input required maxLength={100} autoComplete="name" placeholder="Your full name" value={contactName} onChange={(event) => setContactName(event.target.value)} /></label></div>
    <details className="dc-optional-details"><summary>Add optional details <span>Role & region</span></summary><div className="dc-form-grid"><label>Your role<input maxLength={100} placeholder="e.g. Founder or research lead" value={role} onChange={(event) => setRole(event.target.value)} /></label><label>Country / region<input maxLength={100} autoComplete="country-name" placeholder="e.g. United States" value={region} onChange={(event) => setRegion(event.target.value)} /></label></div></details>
    <div className="dc-form-footer"><span>Uses your existing Agentech account.</span><button className="dc-button dc-primary" disabled={busy}>{busy ? "Saving…" : initial?.profileType === type ? "Save changes" : "Create profile"}<DataIcon name="arrow" size={17} /></button></div>
  </form>;
}
