"use client";

import { useEffect, useState, type FormEvent } from "react";
import { prepareWebsiteInquiry } from "@/lib/website-inquiry";

export function WebsiteInquiryForm() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [draft, setDraft] = useState<{ subject: string; body: string; mailto: string } | null>(null);
  const [message, setMessage] = useState("");

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) || "");
    const result = prepareWebsiteInquiry({
      name: text("name"), email: text("email"), company: text("company"), audience: text("audience"),
      website: text("website"), goal: text("goal"), timeline: text("timeline"), readiness: text("readiness"),
      acceptsPackage: data.get("acceptsPackage") === "on"
    });
    setMessage(result.ok ? "Your draft is ready. Nothing has been sent. Review it, then send it using your email app." : result.error);
    setDraft(result.ok ? result : null);
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`To: info@agent-tech.ai\nSubject: ${draft.subject}\n\n${draft.body}`);
      setMessage("Inquiry copied. Paste it into an email to info@agent-tech.ai when you are ready.");
    } catch {
      setMessage("Copy is unavailable in this browser. Select and copy the draft below.");
    }
  }

  return (
    <form className="wl-inquiry" onSubmit={prepare} onChange={() => { if (draft) { setDraft(null); setMessage(""); } }}>
      <fieldset className="wl-audience">
        <legend>This website is for</legend>
        <label><input type="radio" name="audience" value="business" defaultChecked /> My business</label>
        <label><input type="radio" name="audience" value="agency" /> An agency client</label>
      </fieldset>
      <div className="wl-form-grid">
        <label>Your name<input name="name" autoComplete="name" required maxLength={100} placeholder="Alex Chen" /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="alex@company.com" /></label>
        <label>Company<input name="company" autoComplete="organization" required maxLength={120} placeholder="Company or agency name" /></label>
        <label>Current website <span className="wl-optional">(optional)</span><input name="website" type="url" maxLength={300} placeholder="https://" /></label>
        <label>Target launch <span className="wl-optional">(optional)</span><input name="timeline" maxLength={120} placeholder="e.g. next month" /></label>
        <label>Content readiness<select name="readiness" defaultValue="Some materials ready"><option>Some materials ready</option><option>Logo, images, and copy ready</option><option>Starting from scratch</option></select></label>
      </div>
      <label>What should your website help you do?<textarea name="goal" required minLength={10} maxLength={2000} rows={4} placeholder="Tell us about your business, the pages you need, and the action you want visitors to take." /></label>
      <label className="wl-check"><input name="acceptsPackage" type="checkbox" required /><span>I understand the package is $2,000 for 1–5 main pages. Scope and timing are confirmed before work begins.</span></label>
      <button className="wl-button wl-button-primary" type="submit" disabled={!ready}>Prepare my inquiry <span aria-hidden="true">↗</span></button>
      <noscript><p>Please enable JavaScript to prepare a draft, or email info@agent-tech.ai directly.</p></noscript>
      <p className="wl-form-note">This prepares an email draft. You review and send it yourself. Prefer email? <a href="mailto:info@agent-tech.ai">info@agent-tech.ai</a></p>
      <p role="status" aria-live="polite" className="wl-form-status">{message}</p>
      {draft && <div className="wl-draft"><h3>Your inquiry draft</h3><p>To: info@agent-tech.ai</p><textarea aria-label="Prepared inquiry" readOnly value={`Subject: ${draft.subject}\n\n${draft.body}`} rows={12} /><div className="wl-actions"><a className="wl-button wl-button-primary" href={draft.mailto}>Open email draft ↗</a><button className="wl-button wl-button-outline" type="button" onClick={copyDraft}>Copy inquiry</button></div></div>}
    </form>
  );
}
