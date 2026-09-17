"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { masterSimulationPreviews } from "@/lib/master-simulation-previews";
import {
  masterActionPreviewCall,
  masterActionVerification,
  type MasterActionDocumentation,
  type MasterActionVariant
} from "@/features/eaic/01-clients/eaic-hub/contracts/master-action-documentation";

function PreviewUnavailable() {
  return <p role="status" data-sdk-action-preview-unavailable="true" className="grid min-h-32 place-items-center rounded-[12px] border border-[#dce7f2] bg-[#faf9f6] p-4 text-sm text-[#526174]">Preview unavailable</p>;
}

function ActionPreviewMedia({ asset, label }: { asset: string; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        void video.current?.play().catch(() => undefined);
      } else {
        video.current?.pause();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || loaded || failed) return;
    const timeout = window.setTimeout(() => setFailed(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [visible, loaded, failed]);

  return (
    <div ref={container} data-sdk-action-preview-media="true">
      {failed ? <PreviewUnavailable /> : (
        <div className="relative aspect-video overflow-hidden rounded-[12px] border border-[#dce7f2] bg-[#faf9f6]">
          {visible ? (
            <video
              ref={video}
              src={asset}
              aria-label={label}
              autoPlay muted loop playsInline controls preload="auto"
              onLoadedData={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className="h-full w-full object-contain"
            />
          ) : null}
          {!loaded ? <p role="status" className="pointer-events-none absolute inset-0 grid place-items-center bg-[#faf9f6] p-4 text-xs text-[#526174]">Loading preview…</p> : null}
        </div>
      )}
    </div>
  );
}

function MasterActionPreview({ action }: { action: MasterActionDocumentation }) {
  const preview = masterSimulationPreviews[action.name];
  const initialVariant = action.configurations?.find((option) => option.value === preview?.defaultVariant)?.value
    ?? action.configurations?.[0]?.value ?? "fixed";
  const [selected, setSelected] = useState<MasterActionVariant>(initialVariant);
  // Match exactly: a missing Left clip must never display a Right clip.
  const media = preview?.variants.find((variant) => variant.value === selected);
  const call = masterActionPreviewCall(action, selected);
  const verification = masterActionVerification(action, selected);

  return (
    <aside data-sdk-action-preview={action.name} className="min-w-0 bg-white/70 p-4">
      <h3 data-sdk-typeface="interface" className="mb-3 font-interface text-xs uppercase tracking-[0.12em] text-[#1a73e8]">Action Preview</h3>
      {action.configurations ? (
        <div role="group" aria-label={`Select ${action.name} preview variant`} className="mb-3 inline-flex flex-wrap gap-1 rounded-[12px] border border-[#93bce8] bg-[#eef6ff] p-1">
          {action.configurations.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected === option.value}
              onClick={() => setSelected(option.value)}
              className={`min-h-11 min-w-20 rounded-[8px] px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005bd6] ${selected === option.value ? "bg-[#005bd6] text-white" : "bg-white text-[#1a73e8] hover:bg-[#e5f1ff]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {media ? <ActionPreviewMedia key={media.asset} asset={media.asset} label={`Master ${action.name} preview${selected === "fixed" ? "" : `: ${selected}`}`} /> : <PreviewUnavailable />}
      <code data-sdk-action-preview-call="true" data-sdk-typeface="code" className="mt-3 block break-words font-mono text-xs leading-5 text-[#1a73e8] [overflow-wrap:anywhere]">{call}</code>
      <p className="mt-2 text-xs leading-5 text-[#526174]">Prerecorded MuJoCo simulation.</p>
      {verification ? <p data-sdk-action-verification="true" className="mt-2 text-[11px] leading-5 text-[#526174]">{verification}</p> : null}
    </aside>
  );
}

export function MasterActionReference({ action, copyButton }: { action: MasterActionDocumentation; copyButton: ReactNode }) {
  return (
    <>
      <div data-sdk-action-documentation={action.name} className="min-w-0 bg-[#faf9f6] p-4">
        <p data-sdk-typeface="code" className="break-words font-mono text-xs leading-5 text-[#1a73e8] [overflow-wrap:anywhere]">{action.signature}</p>
        <p data-sdk-action-definition="true" className="mt-2 text-sm leading-6 text-[#303134]">{action.definition}</p>
        {action.configurations ? (
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-[0.14em] text-[#334155]">Options</h3>
            <div className="mt-2 grid gap-2">
              {action.configurations.map((option) => (
                <section key={option.value} data-sdk-action-option={option.value} className="border border-[#dce7f2] bg-white p-3">
                  <h4 className="text-xs font-medium text-[#111111]">{option.title}</h4>
                  <p data-sdk-typeface="code" className="mt-2 break-words font-mono text-xs leading-5 text-[#1a73e8] [overflow-wrap:anywhere]">{option.syntax}</p>
                  <p className="mt-2 text-xs leading-5 text-[#526174]">{option.description}</p>
                </section>
              ))}
            </div>
          </div>
        ) : null}
        <h3 className="mt-4 text-xs uppercase tracking-[0.14em] text-[#334155]">Parameters</h3>
        <div className="mt-2 grid gap-2">
          {action.params.length ? action.params.map((parameter) => (
            <section key={parameter.name} data-sdk-action-parameter={parameter.name} className="border border-[#dce7f2] bg-white p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <code data-sdk-typeface="code" className="font-mono text-[#1a73e8]">{parameter.name}</code>
                <span data-sdk-typeface="code" className="font-mono text-[#526174]">{parameter.type}</span>
                <span className="text-[#526174]">{parameter.defaultValue === undefined ? "Required" : <>Default: <code data-sdk-typeface="code" className="font-mono">{parameter.defaultValue}</code></>}</span>
              </div>
              {parameter.allowedValues ? (
                <div data-sdk-action-allowed-values="true" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#526174]">
                  <span>Allowed values:</span>
                  {parameter.allowedValues.map((value) => <code key={value} data-sdk-typeface="code" className="font-mono text-[#1a73e8]">{value}</code>)}
                </div>
              ) : null}
              {parameter.allowedRange ? <p className="mt-2 text-xs text-[#526174]">Allowed range: <code data-sdk-typeface="code" className="font-mono text-[#1a73e8]">{parameter.allowedRange}</code></p> : null}
              <p className="mt-2 text-xs leading-5 text-[#526174]">{parameter.description}</p>
            </section>
          )) : <p className="border border-[#dce7f2] bg-white p-3 text-xs text-[#334155]">No parameters.</p>}
        </div>
        {action.note ? <p className="mt-3 text-xs leading-5 text-[#526174]">{action.note}</p> : null}
        <h3 className="mt-4 text-xs uppercase tracking-[0.14em] text-[#334155]">Example</h3>
        <div className="relative mt-2 rounded-[12px] border border-black/8 bg-white/70">
          {copyButton}
          <pre data-sdk-action-example="true" data-sdk-typeface="code" className="min-h-14 overflow-x-auto p-3 pr-16 font-mono text-xs leading-6 text-[#303134]">{action.example}</pre>
        </div>
      </div>
      <MasterActionPreview key={action.name} action={action} />
    </>
  );
}
