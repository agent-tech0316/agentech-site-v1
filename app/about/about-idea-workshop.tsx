"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import styles from "./about-idea-workshop.module.css";

const ideaFrames = [
  "/assets/about/idea-sketch-frames-v3/frame-0.webp",
  "/assets/about/idea-sketch-frames-v3/frame-1.webp",
  "/assets/about/idea-sketch-frames-v3/frame-2.webp",
  "/assets/about/idea-sketch-frames-v3/frame-3.webp"
] as const;

const FRAME_INTERVAL_MS = 1000;
const FINAL_FRAME_INDEX = ideaFrames.length - 1;

type IdeaWorkshopProps = {
  active: boolean;
};

export function IdeaWorkshop({ active }: IdeaWorkshopProps) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | null>(null);
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
  const framesReady = loadedFrameCount === ideaFrames.length;
  const hasFrameError = failedFrameCount > 0;

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;

    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const resetSequence = useCallback(() => {
    clearTimer();
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
    pendingPlayRef.current = false;
    pendingNeedsPointerRef.current = false;
    setPlaybackCycle((cycle) => cycle + 1);

    if (prefersReducedMotion) {
      setIsPlaying(false);
      setFrameIndex(ideaFrames.length - 1);
      return;
    }

    setFrameIndex(0);
    setIsPlaying(true);
  }, [clearTimer, prefersReducedMotion]);

  const requestPlayback = useCallback(
    (needsPointer: boolean) => {
      if (!active || !isInViewport) return;
      if (hasFrameError) return;

      if (!framesReady) {
        pendingPlayRef.current = true;
        pendingNeedsPointerRef.current = needsPointer;
        return;
      }

      beginSequence();
    },
    [active, beginSequence, framesReady, hasFrameError, isInViewport]
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
    if (!framesReady || !pendingPlayRef.current || !active || !isInViewport) return;
    if (pendingNeedsPointerRef.current && !pointerInsideRef.current) {
      pendingPlayRef.current = false;
      pendingNeedsPointerRef.current = false;
      return;
    }

    pendingPlayRef.current = false;
    playSequence();
  }, [active, framesReady, isInViewport, playSequence]);

  useEffect(() => {
    if (!prefersReducedMotion || !isPlaying) return;

    clearTimer();
    setIsPlaying(false);
    setFrameIndex(FINAL_FRAME_INDEX);
  }, [clearTimer, isPlaying, prefersReducedMotion]);

  useEffect(() => {
    if (!isPlaying) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;

      if (frameIndex >= FINAL_FRAME_INDEX - 1) {
        setFrameIndex(FINAL_FRAME_INDEX);
        setIsPlaying(false);
        return;
      }

      setFrameIndex((currentFrame) => currentFrame + 1);
    }, FRAME_INTERVAL_MS);

    return clearTimer;
  }, [clearTimer, frameIndex, isPlaying, playbackCycle]);

  const status = hasFrameError
    ? "Idea sketch animation could not load."
    : !framesReady
      ? "Idea sketch animation is loading."
    : isPlaying
      ? `Drawing step ${frameIndex + 1} of ${ideaFrames.length}.`
      : frameIndex === FINAL_FRAME_INDEX
        ? "Idea sketch complete."
        : "Idea sketch ready. Activate to play.";

  return (
    <button
      ref={rootRef}
      type="button"
      data-idea-workshop
      data-active={active ? "true" : "false"}
      data-in-viewport={isInViewport ? "true" : "false"}
      data-frames-ready={framesReady ? "true" : "false"}
      data-frame-error={hasFrameError ? "true" : "false"}
      data-loaded-frame-count={loadedFrameCount}
      data-failed-frame-count={failedFrameCount}
      data-frame-index={frameIndex}
      data-playing={isPlaying ? "true" : "false"}
      data-playback-cycle={playbackCycle}
      className={styles.workshop}
      aria-label="Play the Idea sketch sequence"
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onClick={playSequence}
      onBlur={handleBlur}
    >
      <span className={styles.visual} aria-hidden="true">
        {ideaFrames.map((frame, index) => (
          <Image
            key={frame}
            className={styles.frame}
            data-idea-frame={index}
            data-active-frame={frameIndex === index ? "true" : "false"}
            src={frame}
            alt=""
            fill
            priority={index === 0}
            sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1023px) min(31rem, calc(100vw - 3rem)), 36vw"
            onLoad={(event) => markFrameLoaded(index, event.currentTarget)}
          />
        ))}
      </span>

      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </button>
  );
}
