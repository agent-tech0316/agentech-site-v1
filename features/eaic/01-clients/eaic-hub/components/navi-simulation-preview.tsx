"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getNaviSimulationMedia } from "@/features/eaic/01-clients/eaic-hub/contracts/navi-simulation-media";

export function NaviSimulationPreview({ command }: { command: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animatedImageRef = useRef<HTMLDivElement>(null);
  const autoPlayedSourceRef = useRef<string | null>(null);
  const [animatedImageVisible, setAnimatedImageVisible] = useState(false);
  const [animatedImageRun, setAnimatedImageRun] = useState(0);
  const media = getNaviSimulationMedia(command);
  const videoSource = media?.asset;
  const replayStartSeconds = media?.replayStartSeconds ?? 0;
  const resolvedCommand = media?.command ?? command;
  const isGifImage = Boolean(videoSource && /\.gif(?:[?#]|$)/i.test(videoSource));
  const isAnimatedImage = Boolean(videoSource && /\.(?:gif|webp)(?:[?#]|$)/i.test(videoSource));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSource || isAnimatedImage) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
      return;
    }

    if (autoPlayedSourceRef.current !== videoSource) {
      autoPlayedSourceRef.current = null;
    }

    const playFromStart = () => {
      const startPlayback = () => {
        video.pause();
        video.currentTime = replayStartSeconds;
        void video.play().catch(() => undefined);
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        startPlayback();
        return;
      }
      video.addEventListener("loadedmetadata", startPlayback, { once: true });
      video.load();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || autoPlayedSourceRef.current === videoSource) {
          return;
        }
        autoPlayedSourceRef.current = videoSource;
        playFromStart();
      },
      { threshold: 0.35 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [isAnimatedImage, replayStartSeconds, videoSource]);

  useEffect(() => {
    const container = animatedImageRef.current;
    if (!container || !videoSource || !isAnimatedImage) {
      return;
    }
    setAnimatedImageVisible(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }
        setAnimatedImageVisible(true);
        observer.disconnect();
      },
      { threshold: 0.35 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [isAnimatedImage, videoSource]);

  if (!videoSource) {
    return (
      <div>
        <Image
          src="/assets/robotics/ff-navi-white.jpg"
          alt={`FF Navi robot for Agentech.${resolvedCommand}`}
          width={1200}
          height={675}
          className="aspect-video w-full border border-[#dce7f2] bg-white object-contain"
        />
        <p className="mt-3 text-xs leading-5 text-[#526174]">Simulation preview coming soon</p>
      </div>
    );
  }

  function replay() {
    if (isAnimatedImage) {
      setAnimatedImageVisible(true);
      setAnimatedImageRun((run) => run + 1);
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const replayStart = media?.replayStartSeconds ?? 0;
    const playFromStart = () => {
      video.currentTime = replayStart;
      void video.play().catch(() => undefined);
    };
    video.pause();
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      playFromStart();
      return;
    }
    video.addEventListener("loadedmetadata", playFromStart, { once: true });
    video.load();
  }

  return (
    <div data-navi-preview-media="true">
      {isAnimatedImage ? (
        <div
          ref={animatedImageRef}
          className={isGifImage ? "w-full" : "aspect-video w-full border border-[#dce7f2] bg-black"}
        >
          {animatedImageVisible ? (
            <Image
              key={animatedImageRun}
              src={`${videoSource}&replay=${animatedImageRun}`}
              alt={`Approved Navi MuJoCo simulation for Agentech.${resolvedCommand}`}
              width={isGifImage ? 720 : 640}
              height={isGifImage ? 540 : 360}
              unoptimized
              className={isGifImage
                ? "h-auto w-full border border-[#dce7f2] object-contain"
                : "aspect-video h-full w-full object-contain"}
            />
          ) : null}
        </div>
      ) : (
        <video
          ref={videoRef}
          src={videoSource}
          muted
          playsInline
          preload="metadata"
          aria-label={`Approved Navi MuJoCo simulation for Agentech.${resolvedCommand}`}
          className="aspect-video w-full border border-[#dce7f2] bg-black object-contain"
        />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-[#526174]">Approved Navi MuJoCo simulation</p>
        <button
          type="button"
          onClick={replay}
          className="min-h-11 border border-[#005bd6] bg-[#eef6ff] px-3 py-2 text-xs font-medium text-[#1a73e8] transition motion-reduce:transition-none hover:bg-[#005bd6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005bd6] focus-visible:ring-offset-2"
        >
          Replay simulation
        </button>
      </div>
    </div>
  );
}
