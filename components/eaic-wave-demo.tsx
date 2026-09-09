"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseWaveAction } from "@/lib/eaic-wave-demo";
import styles from "./eaic-wave-demo.module.css";

const artwork = "/assets/products/agentech-library/eaic-next-move-wireframe-v1.png";
// Trace the forearm in the original 1254px artwork, stopping at its cuff.
// The elbow housing and upper arm stay on the stationary layer.
const armPath = "M280 217 H515 V465 L464 500 L473 545 L488 625 L508 716 Q511 740 472 754 Q442 768 411 754 Q390 749 386 718 L362 533 Q358 514 373 502 L350 468 L334 468 L280 367 Z";
const artworkScale = `scale(${1 / 1254})`;

export function EaicWaveDemo() {
  const id = useId().replace(/:/g, "");
  const [word, setWord] = useState("");
  const [interactive, setInteractive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [count, setCount] = useState(0);
  const [state, setState] = useState<"idle" | "running" | "complete">("idle");
  const [message, setMessage] = useState("Type wave. Watch the hand.");
  const [composing, setComposing] = useState(false);
  const wordRevision = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completion = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
  }, []);

  useEffect(() => {
    setInteractive(true);
    return () => {
      clearPending();
      if (completion.current) clearTimeout(completion.current);
    };
  }, [clearPending]);

  const play = useCallback((value: string) => {
    clearPending();
    if (!parseWaveAction(value)) {
      setInvalid(true);
      setMessage("Try wave — this demo only knows one move.");
      return;
    }
    if (!ready || failed) return;
    if (completion.current) clearTimeout(completion.current);
    setInvalid(false);
    setCount(previous => previous + 1);
    const revision = wordRevision.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setState(reduced ? "complete" : "running");
    setMessage(reduced ? "Wave received · motion reduced. The hand stays raised." : "One word. One little wave.");
    if (!reduced) completion.current = setTimeout(() => {
      setState("complete");
      if (wordRevision.current === revision) setMessage("Nice. You just made it wave. Press Enter to try again.");
    }, 2700);
  }, [clearPending, ready, failed]);

  useEffect(() => {
    // Keep a valid word pending until the artwork loads; changing the word,
    // starting IME composition or manually running cancels the pending cue.
    if (ready && !failed && !composing && parseWaveAction(word)) {
      debounce.current = setTimeout(() => play(word), 350);
    }
    return clearPending;
  }, [word, ready, failed, composing, play, clearPending]);

  function updateWord(value: string) {
    wordRevision.current += 1;
    setWord(value);
    setInvalid(false);
    clearPending();
    if (!failed) setMessage(parseWaveAction(value) && !ready ? "Getting the robot ready…" : "Type wave. Watch the hand.");
  }

  return (
    <div className={styles.demo} data-eaic-wave-demo data-art-ready={ready && !failed} data-wave-state={state} data-wave-count={count}>
      <div className={`eaic-public-hero-art ${styles.art}`} aria-hidden="true">
        <svg className={styles.definitions} width="0" height="0" focusable="false">
          <defs>
            <filter id={`${id}-linework`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feColorMatrix type="luminanceToAlpha" />
              <feComponentTransfer result="lineAlpha"><feFuncA type="linear" slope="1.16" intercept="-0.08" /></feComponentTransfer>
              <feFlood floodColor="currentColor" />
              <feComposite operator="in" in2="lineAlpha" />
            </filter>
            <clipPath id={`${id}-body`} clipPathUnits="objectBoundingBox"><path clipRule="evenodd" transform={artworkScale} d={`M0 0H1254V1254H0Z ${armPath}`} /></clipPath>
            <clipPath id={`${id}-arm`} clipPathUnits="objectBoundingBox"><path transform={artworkScale} d={armPath} /></clipPath>
          </defs>
        </svg>
        <div className={styles.layer} data-eaic-wave-body style={{ clipPath: `url(#${id}-body)`, filter: `url(#${id}-linework)` }}>
          <Image src={artwork} alt="" width={1254} height={1254} priority sizes="(min-width: 1280px) 520px, (min-width: 768px) 44vw, 94vw" onLoad={() => setReady(true)} onError={() => { setFailed(true); setMessage("The preview could not load. Please refresh to try again."); }} />
        </div>
        <div key={count} className={`${styles.layer} ${styles.arm}`} data-eaic-wave-arm>
          <div className={styles.layer} style={{ clipPath: `url(#${id}-arm)`, filter: `url(#${id}-linework)` }}>
            <Image src={artwork} alt="" width={1254} height={1254} priority sizes="(min-width: 1280px) 520px, (min-width: 768px) 44vw, 94vw" />
          </div>
        </div>
      </div>
      <form className={styles.editor} onSubmit={event => { event.preventDefault(); if (!composing) play(word); }} aria-label="Try a robot action">
        <label className={styles.prompt} htmlFor={`${id}-word`}>Make your first move <span>01 / WAVE</span></label>
        <div className={styles.codeRow}>
          <code className={styles.code}>
            <span>Agentech.</span>
            <input id={`${id}-word`} aria-label="Robot action" aria-describedby={`${id}-status ${id}-boundary`} aria-invalid={invalid} disabled={!interactive} value={word} placeholder="wave" maxLength={24} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" onChange={event => updateWord(event.target.value)} onCompositionStart={() => { setComposing(true); clearPending(); }} onCompositionEnd={event => { setComposing(false); updateWord(event.currentTarget.value); }} onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} />
            <span>(<span className={styles.argument}>hand=</span><span className={styles.string}>&quot;right&quot;</span>)</span>
          </code>
          <button type="submit" className={styles.run} disabled={!ready || failed} aria-label="Run wave preview" title="Run preview · Enter"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 4 10 6-10 6Z" fill="currentColor" /></svg></button>
        </div>
        <p id={`${id}-status`} className={styles.status} data-eaic-wave-status role="status">{message}</p>
        <p id={`${id}-boundary`} className={styles.boundary}>Browser demo · no robot connected</p>
      </form>
    </div>
  );
}
