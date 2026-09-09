"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getEaicHubTaskPath } from "@/lib/eaic-hub";

type Capability = {
  id: "master-wave" | "navi-home" | "aegis-capture";
  label: string;
  robot: string;
  eyebrow: string;
  title: string;
  summary: string;
  signature: string;
  detail: string;
  constraint: string;
  simulationSrc: string;
};

const capabilities: Capability[] = [
  { id: "master-wave", label: "Wave back", robot: "Master", eyebrow: "Humanoid gesture", title: "A simple hello.", summary: "Begin with a wave, then shape the next interaction around it.", signature: 'Agentech.wave(hand="right")', detail: "The published Master reference supports a standing wave with the selected left or right hand.", constraint: "Use the qualified standing posture and the reviewed control path.", simulationSrc: "/assets/products/agentech-library/simulator-previews/master/02_action_wave_right.mp4" },
  { id: "navi-home", label: "Return home", robot: "Navi", eyebrow: "Quadruped navigation", title: "Find the way home.", summary: "Start from a known route back, then decide what comes next.", signature: "Agentech.return_to_home()", detail: "The published Navi reference returns the robot to its fixed home location and a supported facing direction.", constraint: "The requested behavior is checked against the reviewed Navi SDK before execution review.", simulationSrc: "/assets/products/agentech-library/simulator-previews/navi/return-to-home/navi-return-to-home.mp4" },
  { id: "aegis-capture", label: "Capture a view", robot: "Aegis", eyebrow: "Quadruped sensing", title: "See from a new angle.", summary: "Use one camera frame as the start of a sensing-led idea.", signature: 'Agentech.capture_image(output="agentech_capture.jpg", source="default")', detail: "The published Aegis reference captures one frame from the selected camera source to the requested output path.", constraint: "The Hub manages session captures before it displays them during a reviewed workflow.", simulationSrc: "/assets/products/agentech-library/simulator-previews/aegis/capture-view/aegis-capture-view.mp4" }
];

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
}

export function EaicPublicExperience() {
  const [selectedId, setSelectedId] = useState<Capability["id"] | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [playbackRequest, setPlaybackRequest] = useState(0);
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState("");
  const [codeFeedback, setCodeFeedback] = useState<string | null>(null);
  const [codeError, setCodeError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const triggerAnchor = useRef<{ id: Capability["id"]; top: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = triggerAnchor.current;
    triggerAnchor.current = null;
    if (!anchor) return;
    const button = document.getElementById(`eaic-trigger-${anchor.id}`);
    if (!button) return;
    // Compensate only for a panel collapsing above the clicked label.
    // This keeps it visually in place; it does not navigate to another player.
    const displacement = button.getBoundingClientRect().top - anchor.top;
    if (Math.abs(displacement) > 1) window.scrollBy({ top: displacement, behavior: "instant" });
  }, [selectedId, playbackRequest]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || playbackRequest === 0) return;

    let cancelled = false;
    video.currentTime = 0;
    void video.play().catch((error: unknown) => {
      if (cancelled) return;
      setPlaybackNotice(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Playback was blocked by your browser. Press Run again to watch."
        : "This preview could not load. Press Run again to retry.");
    });
    return () => { cancelled = true; video.pause(); };
  }, [selectedId, playbackRequest]);

  return (
    <section id="capabilities" className="eaic-public-experience" aria-labelledby="eaic-public-experience-title" data-eaic-capability-picker>
      <div className="eaic-public-shell">
        <div className="eaic-public-experience-heading"><p className="eaic-public-kicker">Pick a starting point</p><h2 id="eaic-public-experience-title">What could your robot do next?</h2></div>
        <div className="eaic-public-capability-layout">
          <div className="eaic-public-capability-list" aria-label="Published EAIC capabilities">
            {capabilities.map((capability, index) => {
              const selectedCapability = capability.id === selectedId;
              const command = capability.signature.slice("Agentech.".length, capability.signature.indexOf("("));
              const parameters = capability.signature.slice(capability.signature.indexOf("("));
              const previewId = `eaic-preview-${capability.id}`;
              return (
                <div className="eaic-public-capability-entry" key={capability.id}>
                <button id={`eaic-trigger-${capability.id}`} type="button" data-eaic-capability-trigger aria-pressed={selectedCapability} aria-expanded={selectedCapability} aria-controls={previewId} onClick={(event) => {
                  triggerAnchor.current = { id: capability.id, top: event.currentTarget.getBoundingClientRect().top };
                  setSelectedId(capability.id);
                  setDetailsOpen(false);
                  setPlaybackNotice(null);
                  setCodeValue("");
                  setCodeFeedback(null);
                  setCodeError(false);
                  setPlaybackRequest(0);
                }}>
                  <span>{String(index + 1).padStart(2, "0")}</span><strong>{capability.label}</strong><small>{capability.robot}</small>
                </button>
                {selectedCapability ? <article id={previewId} className="eaic-public-capability-preview" data-eaic-capability-preview aria-labelledby={`eaic-trigger-${capability.id}`}>
            <div className="eaic-public-demo-stage">
            <form className="eaic-public-code-demo" aria-label={`Try the code for ${capability.label}`} onSubmit={(event) => {
              event.preventDefault();
              // Match one documented command; never evaluate input or send it to a robot.
              if (codeValue.trim() !== command) {
                setCodeError(true);
                setCodeFeedback(`For this example, enter ${command} in the highlighted space.`);
                return;
              }
              setCodeError(false);
              setCodeFeedback("Preview running · browser simulation only.");
              setPlaybackNotice(null);
              setPlaybackRequest((request) => request + 1);
            }}>
              <label className="eaic-public-code-label" htmlFor={`eaic-command-${capability.id}`}>Complete the command <span>Type {command}</span></label>
              <div className="eaic-public-code-controls">
                <div className="eaic-public-code-line">
                  <code>Agentech.</code>
                  <input id={`eaic-command-${capability.id}`} data-eaic-code-input aria-label={`Command for ${capability.label}`} aria-invalid={codeError} aria-describedby="eaic-code-feedback" value={codeValue} placeholder={command} size={command.length + 1} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => { setCodeValue(event.target.value); setCodeFeedback(null); setCodeError(false); }} />
                  <code className="eaic-public-code-parameters">{parameters}</code>
                </div>
                <button className="eaic-public-code-run" type="submit" aria-label="Run code preview">Run <ArrowIcon /></button>
              </div>
              <p id="eaic-code-feedback" className="eaic-public-play-hint" data-eaic-code-feedback role={codeError ? "alert" : "status"}>{codeFeedback ?? "Fill the gap, then press Enter or Run to start."}</p>
            </form>
            <div className="eaic-public-media-frame">
                <div data-eaic-simulation-preview>
                  <p>{capability.id === "aegis-capture" ? "Simulated camera preview" : "Simulation preview"}</p>
                  <video ref={videoRef} key={`${capability.id}-${playbackRequest}`} src={capability.simulationSrc} muted playsInline controls={false} preload="metadata"
                    aria-label={`${capability.label} — simulation preview`}
                    onError={(event) => {
                      if (event.currentTarget === videoRef.current) setPlaybackNotice("This preview could not load. Press Run again to retry.");
                    }}
                    onPlaying={(event) => { if (event.currentTarget === videoRef.current) setPlaybackNotice(null); }}
                    onEnded={() => { if (!codeError) setCodeFeedback("Preview finished · press Enter or Run to replay."); }}>
                    Your browser does not support the simulation preview.
                  </video>
                </div>
              <p className="eaic-public-play-hint">{capability.id === "aegis-capture" ? "Illustrative camera sequence · not live robot footage." : "Browser simulation · no robot connected."}</p>
              {playbackNotice ? <p className="eaic-public-play-hint" data-eaic-video-notice role="status">{playbackNotice}</p> : null}
            </div>
            </div>
            <div className="eaic-public-demo-copy">
            <p className="eaic-public-kicker">{capability.eyebrow} / {capability.robot}</p>
            <h3>{capability.title}</h3>
            <p>{capability.summary}</p>
            <div data-eaic-capability-actions>
              <button type="button" className="eaic-public-details-toggle" data-eaic-capability-details aria-expanded={detailsOpen} aria-controls="eaic-capability-detail" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? "Hide SDK & safety detail" : "See SDK & safety detail"}</button>
              <Link href={getEaicHubTaskPath("view-sdk")} className="eaic-public-preview-link">Inspect this in the SDK <ArrowIcon /></Link>
            </div>
            {detailsOpen ? <div id="eaic-capability-detail" className="eaic-public-capability-detail"><code>{capability.signature}</code><p>{capability.detail}</p><p>{capability.constraint}</p></div> : null}
            </div>
          </article> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
