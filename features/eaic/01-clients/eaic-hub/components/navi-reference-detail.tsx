"use client";

import { useState } from "react";
import { getNaviReturnPresentation, type PublicNaviReference } from "@/features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer";
import { getNaviSimulationMedia } from "@/features/eaic/01-clients/eaic-hub/contracts/navi-simulation-media";
import { NaviPremiumFeaturePanel } from "@/features/eaic/01-clients/eaic-hub/components/navi-premium-feature-panel";
import { NaviSimulationPreview } from "@/features/eaic/01-clients/eaic-hub/components/navi-simulation-preview";

function NaviCopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy command failed");
      }
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={copy} className="min-h-11 rounded-full border border-[#1a73e8] bg-white px-4 py-2 text-sm font-semibold text-[#1a73e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2">
        Copy example
      </button>
      <span aria-live="polite" className="text-xs text-[#334155]">
        {status === "success" ? "Code copied." : status === "error" ? "Copy failed. Select and copy the code manually." : ""}
      </span>
    </div>
  );
}

function DetailSection({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <section data-navi-detail-section={name} className="border-t border-black/8 px-4 py-5 first:border-t-0 sm:px-5">
      <h3 data-sdk-typeface="interface" className="font-interface text-xs font-semibold uppercase tracking-[0.14em] text-[#1a73e8]">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function NaviReferenceDetail({
  reference,
  globalSafetyLimits,
  onRequestClose,
}: {
  reference: PublicNaviReference;
  globalSafetyLimits: readonly string[];
  onRequestClose: () => void;
}): React.JSX.Element {
  const returnValue = getNaviReturnPresentation(reference);
  const media = getNaviSimulationMedia(reference.name);
  const detailId = `navi-reference-detail-${reference.name}`;

  return (
    <div
      id={detailId}
      data-navi-reference-detail="true"
      data-navi-reference-name={reference.name}
      role="region"
      aria-labelledby={`${detailId}-title`}
      className="min-w-0 bg-[#faf9f6]"
    >
      <div className="flex flex-col gap-3 border-b border-black/8 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <button data-navi-mobile-back="true" type="button" onClick={onRequestClose} className="order-1 min-h-11 shrink-0 self-start rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-[#334155] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2 lg:order-2 lg:self-auto">
          <span className="lg:hidden">Back to references</span>
          <span className="hidden lg:inline">Close details</span>
        </button>
        <div className="order-2 min-w-0 lg:order-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#526174]">{reference.category}</p>
          <h2 id={`${detailId}-title`} data-sdk-typeface="code" className="mt-1 min-w-0 break-words font-mono text-base font-semibold text-[#111111] [overflow-wrap:anywhere]">{reference.name}</h2>
        </div>
      </div>

      <DetailSection name="signature" title="Signature">
        <pre data-sdk-typeface="code" className="overflow-x-auto rounded-[12px] border border-black/8 bg-white p-3 font-mono text-xs leading-6 text-[#1a73e8]">{reference.signature}</pre>
      </DetailSection>

      <DetailSection name="availability" title="Availability and access">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-[#008a7a] bg-white px-3 py-1.5 text-[#1a73e8]">{reference.status === "development" ? "Under development" : reference.status === "unsupported" ? "Not supported" : "Available"}</span>
          {reference.access?.tier === "premium" ? <span className="rounded-full border border-[#7c5ce7] bg-white px-3 py-1.5 text-[#1a73e8]">Premium</span> : null}
          {reference.creditUsage === "high" ? <span className="rounded-full border border-[#d97706] bg-white px-3 py-1.5 text-[#334155]">High credit usage</span> : null}
          {reference.access?.includedWithMonthlySubscription ? <span className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[#334155]">Included with monthly subscription</span> : null}
          {reference.access?.oneTimePurchase ? <span className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[#334155]">One-time purchase available</span> : null}
        </div>
      </DetailSection>

      <DetailSection name="definition" title="Definition">
        <p className="text-sm leading-7 text-[#303134]">{reference.summary}</p>
      </DetailSection>

      <DetailSection name="profiles" title="Parameter profiles">
        {reference.profiles.length ? (
          <div className="grid gap-3">
            {reference.profiles.map((profile) => (
              <div key={`${profile.name}-${profile.syntax}`} className="rounded-[12px] border border-black/8 bg-white p-3">
                <p className="text-sm font-semibold text-[#111111]">{profile.name}</p>
                <pre data-sdk-typeface="code" className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-[#1a73e8]">{profile.syntax}</pre>
                {profile.description ? <p className="mt-2 text-xs leading-5 text-[#526174]">{profile.description}</p> : null}
                {profile.note ? <p className="mt-2 text-xs leading-5 text-[#526174]"><span className="font-semibold">{profile.noteLabel ?? "Note"}:</span> {profile.note}</p> : null}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-[#526174]">No parameter profiles.</p>}
      </DetailSection>

      <DetailSection name="parameters" title="Parameters">
        {reference.params.length ? (
          <div className="grid gap-3">
            {reference.params.map((param) => (
              <div key={param.name} className="rounded-[12px] border border-black/8 bg-white p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <code data-sdk-typeface="code" className="font-mono text-xs font-semibold text-[#1a73e8]">{param.name}</code>
                  <code data-sdk-typeface="code" className="font-mono text-xs text-[#1a73e8]">{param.type}</code>
                  {param.defaultValue !== undefined ? <span className="text-xs text-[#526174]">default {param.defaultValue}</span> : null}
                </div>
                {param.allowedValues?.length ? <p className="mt-2 text-xs text-[#526174]">Allowed values: {param.allowedValues.join(", ")}</p> : null}
                {param.allowedRange ? <p className="mt-2 text-xs text-[#526174]">Allowed range: {param.allowedRange}</p> : null}
                <p className="mt-2 text-xs leading-5 text-[#334155]">{param.description}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-[#334155]">No parameters.</p>}
      </DetailSection>

      <DetailSection name="returns" title="Return value">
        {returnValue.type ? <code data-sdk-typeface="code" className="font-mono text-xs text-[#1a73e8]">{returnValue.type}</code> : null}
        <p className={`${returnValue.type ? "mt-2 " : ""}text-sm leading-6 text-[#334155]`}>{returnValue.description}</p>
      </DetailSection>

      <DetailSection name="example" title="Example">
        <pre data-sdk-typeface="code" className="overflow-x-auto whitespace-pre-wrap rounded-[12px] border border-black/8 bg-white p-3 font-mono text-xs leading-6 text-[#303134]">{reference.example}</pre>
        <div className="mt-3"><NaviCopyButton value={reference.example} /></div>
      </DetailSection>

      <DetailSection name="safety" title="Safety and limits">
        {reference.platformNote ? (
          <aside className="rounded-[12px] border border-[#e1ad32] bg-[#faf9f6] p-3 text-sm leading-6 text-[#334155]">
            <span className="font-semibold">{reference.platformNoteLabel ?? "Platform note"}:</span> {reference.platformNote}
          </aside>
        ) : null}
        <div className={reference.platformNote ? "mt-4" : ""}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1a73e8]">Global Navi safety limits</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-[#334155]">
            {globalSafetyLimits.map((limit) => <li key={limit}>{limit}</li>)}
          </ul>
        </div>
      </DetailSection>

      {reference.access?.tier === "premium" ? (
        <DetailSection name="premium" title="Premium access">
          <NaviPremiumFeaturePanel reference={reference} />
        </DetailSection>
      ) : null}

      {media ? (
        <DetailSection name="media" title="Reference media">
          <NaviSimulationPreview command={reference.name} />
        </DetailSection>
      ) : null}
    </div>
  );
}
