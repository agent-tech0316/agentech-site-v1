"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import styles from "./about-story-frame-player.module.css";

type AboutStoryFramePlayerProps = {
  story: "build" | "share";
  label: string;
  frames: readonly string[];
  frameIntervalMs: number;
  active?: boolean;
};

export function AboutStoryFramePlayer({
  story,
  label,
  frames,
  frameIntervalMs,
  active = true
}: AboutStoryFramePlayerProps) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  const loadedFramesRef = useRef(new Set<number>());
  const failedFramesRef = useRef(new Set<number>());
  const pointerInsideRef = useRef(false);
  const lastPointerWasTouchRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const pendingNeedsPointerRef = useRef(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackCycle, setPlaybackCycle] = useState(0);
  const [isInViewport, setIsInViewport] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [loadedFrameCount, setLoadedFrameCount] = useState(0);
  const [failedFrameCount, setFailedFrameCount] = useState(0);
  const [isPlaybackPending, setIsPlaybackPending] = useState(false);
  const finalFrameIndex = Math.max(frames.length - 1, 0);
  const firstActiveFrameIndex = Math.min(1, finalFrameIndex);
  const requiredStartFrameIndex = prefersReducedMotion ? finalFrameIndex : firstActiveFrameIndex;
  const framesReady = frames.length > 0 && loadedFrameCount === frames.length;
  const hasFrameError = failedFrameCount > 0;

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;

    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const resetSequence = useCallback(() => {
    clearTimer();
    pendingFrameRef.current = null;
    setIsPlaybackPending(false);
    setIsPlaying(false);
    setFrameIndex(0);
  }, [clearTimer]);

  const cancelSequence = useCallback(() => {
    pointerInsideRef.current = false;
    lastPointerWasTouchRef.current = false;
    pendingPlayRef.current = false;
    pendingNeedsPointerRef.current = false;
    resetSequence();
  }, [resetSequence]);

  const beginSequence = useCallback(() => {
    clearTimer();
    pendingFrameRef.current = null;
    pendingPlayRef.current = false;
    pendingNeedsPointerRef.current = false;
    setIsPlaybackPending(false);
    setPlaybackCycle((cycle) => cycle + 1);

    if (prefersReducedMotion) {
      setIsPlaying(false);
      setFrameIndex(finalFrameIndex);
      return;
    }

    setFrameIndex(firstActiveFrameIndex);
    setIsPlaying(firstActiveFrameIndex < finalFrameIndex);
  }, [clearTimer, finalFrameIndex, firstActiveFrameIndex, prefersReducedMotion]);

  const requestPlayback = useCallback(
    (needsPointer: boolean) => {
      if (!active || !isInViewport || frames.length === 0 || hasFrameError) return;

      if (!loadedFramesRef.current.has(requiredStartFrameIndex)) {
        pendingPlayRef.current = true;
        pendingNeedsPointerRef.current = needsPointer;
        setIsPlaybackPending(true);
        return;
      }

      beginSequence();
    },
    [active, beginSequence, frames.length, hasFrameError, isInViewport, requiredStartFrameIndex]
  );

  const playSequence = useCallback(() => {
    requestPlayback(false);
  }, [requestPlayback]);

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch") {
        lastPointerWasTouchRef.current = true;
        return;
      }

      lastPointerWasTouchRef.current = false;
      pointerInsideRef.current = true;
      requestPlayback(true);
    },
    [requestPlayback]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch" || lastPointerWasTouchRef.current) return;
      cancelSequence();
    },
    [cancelSequence]
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    lastPointerWasTouchRef.current = event.pointerType === "touch";
  }, []);

  const handleBlur = useCallback(() => {
    cancelSequence();
  }, [cancelSequence]);

  const markFrameLoaded = useCallback(
    (index: number, image: HTMLImageElement) => {
      void image.decode().then(() => {
        if (loadedFramesRef.current.has(index) || !image.complete || image.naturalWidth === 0) return;

        loadedFramesRef.current.add(index);
        setLoadedFrameCount(loadedFramesRef.current.size);
      }).catch(() => {
        if (failedFramesRef.current.has(index)) return;

        failedFramesRef.current.add(index);
        setFailedFrameCount(failedFramesRef.current.size);
        pendingPlayRef.current = false;
        pendingNeedsPointerRef.current = false;
        resetSequence();
      });
    },
    [resetSequence]
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(media.matches);

    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInViewport(entry.isIntersecting && entry.intersectionRatio >= 0.25),
      { threshold: 0.25 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (active && isInViewport) return;
    cancelSequence();
  }, [active, cancelSequence, isInViewport]);

  useEffect(() => {
    if (!pendingPlayRef.current || !active || !isInViewport) return;
    if (!loadedFramesRef.current.has(requiredStartFrameIndex)) return;
    if (pendingNeedsPointerRef.current && !pointerInsideRef.current) {
      pendingPlayRef.current = false;
      pendingNeedsPointerRef.current = false;
      setIsPlaybackPending(false);
      return;
    }

    pendingPlayRef.current = false;
    playSequence();
  }, [active, isInViewport, loadedFrameCount, playSequence, requiredStartFrameIndex]);

  useEffect(() => {
    const pendingFrameIndex = pendingFrameRef.current;
    if (!isPlaying || pendingFrameIndex === null) return;
    if (!loadedFramesRef.current.has(pendingFrameIndex)) return;

    pendingFrameRef.current = null;
    setIsPlaybackPending(false);
    setFrameIndex(pendingFrameIndex);
    if (pendingFrameIndex >= finalFrameIndex) setIsPlaying(false);
  }, [finalFrameIndex, isPlaying, loadedFrameCount]);

  useEffect(() => {
    if (!prefersReducedMotion || !isPlaying) return;

    clearTimer();
    pendingFrameRef.current = null;
    if (!loadedFramesRef.current.has(finalFrameIndex)) {
      pendingPlayRef.current = true;
      pendingNeedsPointerRef.current = false;
      setIsPlaying(false);
      setIsPlaybackPending(true);
      return;
    }

    setIsPlaybackPending(false);
    setIsPlaying(false);
    setFrameIndex(finalFrameIndex);
  }, [clearTimer, finalFrameIndex, isPlaying, prefersReducedMotion]);

  useEffect(() => {
    if (!isPlaying || isPlaybackPending) return;

    const nextFrameIndex = frameIndex + 1;
    if (nextFrameIndex > finalFrameIndex) {
      setIsPlaying(false);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;

      if (!loadedFramesRef.current.has(nextFrameIndex)) {
        pendingFrameRef.current = nextFrameIndex;
        setIsPlaybackPending(true);
        return;
      }

      setFrameIndex(nextFrameIndex);
      if (nextFrameIndex >= finalFrameIndex) setIsPlaying(false);
    }, frameIntervalMs);

    return clearTimer;
  }, [clearTimer, finalFrameIndex, frameIndex, frameIntervalMs, isPlaybackPending, isPlaying, playbackCycle]);

  const status = hasFrameError
    ? `${label} story animation could not load.`
    : isPlaybackPending
      ? `Preparing the next ${label} story step.`
      : !framesReady
        ? `${label} story animation is loading.`
        : isPlaying
          ? `${label} story step ${frameIndex + 1} of ${frames.length}.`
          : frameIndex === finalFrameIndex && frames.length > 1
            ? `${label} story complete.`
            : `${label} story ready. Activate to play.`;

  return (
    <button
      ref={rootRef}
      type="button"
      data-about-story-player={story}
      data-active={active ? "true" : "false"}
      data-in-viewport={isInViewport ? "true" : "false"}
      data-frames-ready={framesReady ? "true" : "false"}
      data-frame-error={hasFrameError ? "true" : "false"}
      data-loaded-frame-count={loadedFrameCount}
      data-failed-frame-count={failedFrameCount}
      data-frame-index={frameIndex}
      data-playing={isPlaying ? "true" : "false"}
      data-playback-pending={isPlaybackPending ? "true" : "false"}
      data-playback-cycle={playbackCycle}
      className={styles.player}
      aria-label={`Play the ${label} story`}
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onClick={playSequence}
      onBlur={handleBlur}
    >
      <span className={styles.visual} aria-hidden="true">
        {frames.map((frame, index) => (
          <Image
            key={`${story}-${frame}`}
            className={styles.frame}
            data-story-frame={index}
            data-active-frame={frameIndex === index ? "true" : "false"}
            src={frame}
            alt=""
            fill
            priority={index <= firstActiveFrameIndex}
            sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1023px) min(31rem, calc(100vw - 3rem)), 36vw"
            onLoad={(event) => markFrameLoaded(index, event.currentTarget)}
          />
        ))}
        <span
          data-story-loading-cue
          data-visible={isPlaybackPending ? "true" : "false"}
          className={styles.loadingCue}
        >
          Preparing story…
        </span>
      </span>

      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </button>
  );
}
