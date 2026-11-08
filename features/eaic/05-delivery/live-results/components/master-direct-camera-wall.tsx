"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { planMasterH264Views } from "@/lib/master-h264-view-plan";
import { MASTER_LIVE_CAMERAS, type MasterCameraId, type MasterViewSelection } from "@/lib/master-live-camera";
import { getMasterH264PreviewUrl, startMasterH264Preview } from "./master-h264-preview.mjs";

type H264PreviewState = {
  phase: "connecting" | "keyframe" | "decoding" | "stopped" | "error";
  cameraId: MasterCameraId;
  generation: number;
  width: number;
  height: number;
  fps: number;
  bytesPerSecond: number;
  codec: string;
  error: string | null;
};

const RELAY_URL = process.env.NEXT_PUBLIC_MASTER_CAMERA_RELAY_URL || "ws://127.0.0.1:4173/robot";

export function MasterDirectCameraWall({ selection }: { selection: MasterViewSelection }) {
  const views = useMemo(() => planMasterH264Views(selection), [selection]);
  const [available, setAvailable] = useState<Partial<Record<MasterCameraId, boolean>>>({});
  const [streamLabels, setStreamLabels] = useState<Partial<Record<MasterCameraId, string>>>({});
  const [status, setStatus] = useState("Connecting to Master H.264 cameras…");
  const canvases = useRef(new Map<MasterCameraId, HTMLCanvasElement>());

  useEffect(() => {
    let stopped = false;
    let pageVisible = document.visibilityState !== "hidden";
    const decoders = new Map<MasterCameraId, () => void>();
    setAvailable({});
    setStreamLabels({});

    const stopAll = () => {
      for (const stopDecoder of decoders.values()) stopDecoder();
      decoders.clear();
    };

    const startH264Views = () => {
      if (stopped || !pageVisible || decoders.size > 0) return;
      setStatus(`Connecting to ${views.length} Master H.264 camera${views.length === 1 ? "" : "s"}…`);
      for (const view of views) {
        const canvas = canvases.current.get(view.cameraId);
        if (!canvas) {
          setStatus(`${view.label} canvas is unavailable`);
          continue;
        }
        const stopDecoder = startMasterH264Preview({
          url: getMasterH264PreviewUrl(RELAY_URL, view.cameraId, view.mode),
          cameraId: view.cameraId,
          canvas,
          onState: (state: H264PreviewState) => {
            if (stopped) return;
            if (state.phase === "connecting") {
              setStatus(state.error || `Connecting to ${view.label} H.264…`);
              return;
            }
            if (state.phase === "keyframe") {
              setStatus(`${view.label} H.264 connected · waiting for a keyframe…`);
              return;
            }
            if (state.phase === "decoding") {
              setAvailable((current) => current[view.cameraId]
                ? current
                : { ...current, [view.cameraId]: true });
              const megabits = (state.bytesPerSecond * 8 / 1_000_000).toFixed(1);
              setStreamLabels((current) => ({
                ...current,
                [view.cameraId]: `${state.width}x${state.height} H.264 · ${state.fps} FPS · ${megabits} Mbps`,
              }));
              setStatus(
                selection.mode === "focus"
                  ? `${view.label} native H.264 · ${state.width}x${state.height} · ${state.fps} FPS`
                  : `Master H.264 camera wall · target 30 FPS · generation ${state.generation}`,
              );
              return;
            }
            if (state.phase === "error") {
              setStatus(`${view.label} H.264 error · ${state.error || "decoder failed"}`);
            }
          },
        });
        decoders.set(view.cameraId, stopDecoder);
      }
    };

    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState !== "hidden";
      if (!pageVisible) {
        stopAll();
        setStatus("Paused while this tab is hidden");
        return;
      }
      startH264Views();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (pageVisible) startH264Views();
    else setStatus("Paused while this tab is hidden");
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopAll();
    };
  }, [selection, views]);

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-[var(--color-text-secondary)]" role="status">{status}</p>
      <div className={`grid gap-3 ${selection.mode === "wall" ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        {views.map((view) => {
          const camera = MASTER_LIVE_CAMERAS.find(({ id }) => id === view.cameraId)!;
          return (
            <div key={view.cameraId} data-master-camera-live className="relative aspect-video overflow-hidden border border-[#476784] bg-[#07111c]">
              <canvas
                ref={(node) => {
                  if (node) canvases.current.set(view.cameraId, node);
                  else canvases.current.delete(view.cameraId);
                }}
                aria-label={`${view.label} live camera`}
                className="h-full w-full object-contain"
              />
              {available[view.cameraId] ? null : (
                <div className="absolute inset-0 grid place-items-center text-sm text-[#bfdbfe]">
                  Waiting for {view.label}…
                </div>
              )}
              <span className="absolute left-2 top-2 bg-[#07111c]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#93c5fd]">
                {view.label} · {streamLabels[view.cameraId] ?? (view.mode === "focus" ? camera.focusResolution : camera.wallResolution)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
