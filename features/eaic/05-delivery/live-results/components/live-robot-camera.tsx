"use client";

import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeLiveRobotModel,
  normalizeMasterViewSelection,
  type LiveRobotModel,
  type MasterViewSelection,
} from "@/lib/master-live-camera";
import {
  desiredMasterTrackSubscriptions,
  expectedMasterTrack,
  isApprovedMasterTrackName,
} from "@/lib/master-livekit-track-state";
import { MasterLiveCameraControls } from "./master-live-camera-controls";
import { MasterLivekitCameraGrid } from "./master-livekit-camera-grid";

type LiveRobotCameraProps = {
  roomName: string;
};

const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
const captureTopic = "agentech.capture-image";

type CaptureChunk = {
  captureId: string;
  index: number;
  total: number;
  mimeType: string;
  createdAt: string;
  data: string;
};

type DisplayCapture = {
  captureId: string;
  createdAt: string;
  dataUrl: string;
};

function captureExtension(dataUrl: string) {
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  const storedExtension = decodeURIComponent(dataUrl).match(/\.(png|webp|jpe?g)(?:$|[&#])/i)?.[1]?.toLowerCase();
  if (storedExtension === "png" || storedExtension === "webp") return storedExtension;
  return "jpg";
}

function masterPublications(room: Room) {
  const publications: RemoteTrackPublication[] = [];
  room.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => publications.push(publication));
  });
  return publications;
}

function applyMasterSubscriptions(room: Room, selection: MasterViewSelection) {
  const publications = masterPublications(room);
  const desired = new Map(
    desiredMasterTrackSubscriptions(selection, publications).map((entry) => [entry.trackSid, entry.subscribe]),
  );
  for (const publication of publications) {
    const subscribe = desired.get(publication.trackSid);
    if (subscribe !== undefined && publication.isSubscribed !== subscribe) {
      publication.setSubscribed(subscribe);
    }
  }
}

export function LiveRobotCamera({ roomName }: LiveRobotCameraProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeRoomRef = useRef<Room | null>(null);
  const masterSelectionRef = useRef<MasterViewSelection>({ mode: "wall" });
  const [isViewing, setIsViewing] = useState(false);
  const [status, setStatus] = useState(livekitUrl
    ? "Waiting for the scheduled session. Live view will start automatically."
    : "LiveKit URL is not configured.");
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureTime, setCaptureTime] = useState("");
  const [captureHistory, setCaptureHistory] = useState<DisplayCapture[]>([]);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [teachingViewer, setTeachingViewer] = useState(false);
  const [activeRobotModel, setActiveRobotModel] = useState<LiveRobotModel | null>(null);
  const [localMasterPreview, setLocalMasterPreview] = useState(false);
  const [masterSelection, setMasterSelection] = useState<MasterViewSelection>({ mode: "wall" });
  const [masterTracksByName, setMasterTracksByName] = useState<Map<string, RemoteVideoTrack>>(new Map());
  const localCaptureIdRef = useRef("");
  const manuallyStoppedSessionIdRef = useRef<number | "teaching-viewer" | null>(null);
  const viewingKey = activeSessionId ?? (teachingViewer ? "teaching-viewer" : null);
  const isNaviSession = hasActiveSession && activeRobotModel === "Navi";
  const showLiveCapturePreview = hasActiveSession && activeRobotModel === "Aegies";
  const masterPreview = process.env.NODE_ENV === "development"
    && (process.env.NEXT_PUBLIC_MASTER_CAMERA_PREVIEW === "1" || localMasterPreview);
  const isMasterSession = hasActiveSession && activeRobotModel === "Master";
  const showMasterControls = isMasterSession || masterPreview;

  const changeMasterSelection = useCallback((selection: MasterViewSelection) => {
    masterSelectionRef.current = selection;
    setMasterSelection(selection);
  }, []);

  useEffect(() => {
    masterSelectionRef.current = masterSelection;
    const room = activeRoomRef.current;
    if (room && isMasterSession) applyMasterSubscriptions(room, masterSelection);
    if (isMasterSession && isViewing) setStatus("Switching camera...");
  }, [isMasterSession, isViewing, masterSelection]);

  useEffect(() => {
    if (!isMasterSession || !isViewing) return;
    const expected = expectedMasterTrack(masterSelection);
    if (masterTracksByName.has(expected.trackName)) {
      setStatus("Live robot camera connected.");
      return;
    }
    setStatus("Switching camera...");
    const timer = window.setTimeout(() => {
      setStatus(masterSelection.mode === "focus"
        ? "Selected H.264 camera did not arrive. Choose Camera Wall to retry."
        : "The JPEG camera wall did not arrive. Retry Camera Wall.");
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [isMasterSession, isViewing, masterSelection, masterTracksByName]);

  useEffect(() => {
    if (!isMasterSession || activeSessionId === null) return;
    let active = true;
    async function readMasterSelection() {
      try {
        const response = await fetch("/api/master-live-camera", { cache: "no-store" });
        const payload = await response.json() as { selection?: unknown };
        if (active && response.ok) changeMasterSelection(normalizeMasterViewSelection(payload.selection));
      } catch {
        // Keep the default wall until the authenticated selection can be read.
      }
    }
    void readMasterSelection();
    return () => { active = false; };
  }, [activeSessionId, changeMasterSelection, isMasterSession]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const localHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    setLocalMasterPreview(localHost && new URLSearchParams(window.location.search).get("masterCameraPreview") === "1");
  }, []);

  const receiveCapture = useCallback((capture: DisplayCapture) => {
    setCaptureUrl(capture.dataUrl);
    setCaptureTime(capture.createdAt);
    setCaptureHistory((current) => current.some((item) => item.captureId === capture.captureId)
      ? current
      : [...current, capture]);
  }, []);

  useEffect(() => {
    let active = true;
    async function readLocalCapture() {
      try {
        const response = await fetch("/api/agentech-capture", { cache: "no-store" });
        const payload = (await response.json()) as {
          capture?: { captureId: string; createdAt: string; dataUrl: string } | null;
          captures?: DisplayCapture[];
        };
        if (active && response.ok && payload.captures) {
          payload.captures.forEach(receiveCapture);
        }
        if (active && response.ok && payload.capture && payload.capture.captureId !== localCaptureIdRef.current) {
          localCaptureIdRef.current = payload.capture.captureId;
          receiveCapture(payload.capture);
        }
      } catch {
        // The local relay may not be ready while the development server recompiles.
      }
    }
    void readLocalCapture();
    const timer = window.setInterval(() => void readLocalCapture(), livekitUrl ? 5000 : 750);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [receiveCapture]);

  useEffect(() => {
    let active = true;

    async function readActiveSession() {
      try {
        const response = await fetch("/api/agentech-live-session", { cache: "no-store" });
        const payload = (await response.json()) as {
          active?: boolean;
          teachingViewer?: boolean;
          session?: { id?: number; robotModel?: string } | null;
        };
        if (!active) return;
        const model = normalizeLiveRobotModel(payload.session?.robotModel);
        const sessionId = Number(payload.session?.id);
        const sessionIsActive = response.ok
          && payload.active === true
          && Number.isInteger(sessionId)
          && Boolean(model);
        setTeachingViewer(response.ok && payload.teachingViewer === true);
        setHasActiveSession(sessionIsActive || (response.ok && payload.teachingViewer === true));
        setActiveSessionId(sessionIsActive ? sessionId : null);
        setActiveRobotModel(sessionIsActive ? model : null);
      } catch {
        // Keep the last confirmed session state during a transient request
        // failure. The next poll will reconcile it without forcing a refresh.
      }
    }

    void readActiveSession();
    const timer = window.setInterval(() => void readActiveSession(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!livekitUrl) return;
    if (!hasActiveSession || viewingKey === null) {
      manuallyStoppedSessionIdRef.current = null;
      if (isViewing) {
        setIsViewing(false);
        setStatus("Scheduled robot session ended. Waiting for the next session.");
      }
      return;
    }
    if (isViewing || manuallyStoppedSessionIdRef.current === viewingKey) return;

    const timer = window.setTimeout(() => {
      setStatus(teachingViewer ? "Teaching account viewer access enabled. Connecting..." : "Scheduled session is active. Connecting automatically...");
      setIsViewing(true);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [viewingKey, teachingViewer, hasActiveSession, isViewing]);

  useEffect(() => {
    if (!livekitUrl || !isViewing) {
      return;
    }

    let activeRoom: Room | null = null;
    const videoElement = videoRef.current;
    const masterConnection = activeRobotModel === "Master";
    let isMounted = true;
    let videoConnected = false;
    let noVideoTimer: ReturnType<typeof setTimeout> | null = null;

    function attachVideo(track: RemoteTrack) {
      if (!videoElement || track.kind !== Track.Kind.Video) {
        return;
      }

      videoConnected = true;
      if (noVideoTimer) {
        clearTimeout(noVideoTimer);
        noVideoTimer = null;
      }
      // Ask the browser to stay at the live edge instead of building a large
      // jitter buffer. The publisher/ingress still determines most end-to-end
      // latency, but this prevents avoidable client-side playout delay.
      track.setPlayoutDelay(0);
      track.attach(videoElement);
      setStatus("Live robot camera connected.");
    }

    function attachMasterVideo(track: RemoteTrack, publication: RemoteTrackPublication) {
      if (!isApprovedMasterTrackName(publication.trackName) || track.kind !== Track.Kind.Video) return;
      videoConnected = true;
      if (noVideoTimer) {
        clearTimeout(noVideoTimer);
        noVideoTimer = null;
      }
      setMasterTracksByName((current) => {
        const next = new Map(current);
        next.set(publication.trackName, track as RemoteVideoTrack);
        return next;
      });
      setStatus("Live robot camera connected.");
    }

    function detachMasterVideo(track: RemoteTrack, publication: RemoteTrackPublication) {
      track.detach();
      setMasterTracksByName((current) => {
        if (current.get(publication.trackName) !== track) return current;
        const next = new Map(current);
        next.delete(publication.trackName);
        return next;
      });
    }

    async function connect() {
      try {
        setStatus("Connecting to live robot camera...");
        const targetRoomName = activeRobotModel === "Master" ? "master-live-1" : roomName;
        const response = await fetch(`/api/livekit-token?room=${encodeURIComponent(targetRoomName)}`, { cache: "no-store" });
        const payload = (await response.json()) as { token?: string; error?: string; robotModel?: string };

        if (!response.ok || !payload.token) {
          throw new Error(payload.error || "Could not create LiveKit viewer token.");
        }
        const sessionModel = normalizeLiveRobotModel(payload.robotModel);
        if (sessionModel) {
          setHasActiveSession(true);
          setActiveRobotModel(sessionModel);
        }

        const room = new Room({
          adaptiveStream: false,
          dynacast: false
        });
        activeRoom = room;
        activeRoomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, publication) => {
          if (masterConnection) attachMasterVideo(track, publication);
          else attachVideo(track);
        });

        room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
          if (masterConnection) {
            detachMasterVideo(track, publication);
          } else {
            track.detach();
          }
          if (isMounted && !masterConnection) {
            setStatus("Robot camera stream paused.");
          }
        });

        room.on(RoomEvent.TrackPublished, () => {
          if (masterConnection) applyMasterSubscriptions(room, masterSelectionRef.current);
        });

        const captureChunks = new Map<string, Array<string | undefined>>();
        room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
          if (topic !== captureTopic) {
            return;
          }

          try {
            const chunk = JSON.parse(new TextDecoder().decode(payload)) as CaptureChunk;
            if (!chunk.captureId || !Number.isInteger(chunk.index) || !Number.isInteger(chunk.total) || chunk.total < 1) {
              return;
            }
            if (chunk.index < 0 || chunk.index >= chunk.total) {
              return;
            }
            const chunks = captureChunks.get(chunk.captureId) ?? Array.from<string | undefined>({ length: chunk.total });
            if (chunks.length !== chunk.total) {
              return;
            }
            chunks[chunk.index] = chunk.data;
            captureChunks.set(chunk.captureId, chunks);
            const receivedCount = chunks.reduce((count, part) => count + (typeof part === "string" ? 1 : 0), 0);
            if (receivedCount === chunk.total) {
              receiveCapture({
                captureId: chunk.captureId,
                createdAt: chunk.createdAt,
                dataUrl: `data:${chunk.mimeType};base64,${chunks.join("")}`
              });
              captureChunks.delete(chunk.captureId);
            }
          } catch {
            // Ignore unrelated or incomplete room data.
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          if (isMounted) {
            setStatus("Robot camera disconnected.");
          }
        });

        await room.connect(livekitUrl, payload.token, { autoSubscribe: !masterConnection });

        if (masterConnection) {
          applyMasterSubscriptions(room, masterSelectionRef.current);
        } else {
          room.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((publication) => {
              if (publication.track) attachVideo(publication.track);
            });
          });
        }

        if (masterConnection || !Array.from(room.remoteParticipants.values()).some((participant) => Array.from(participant.trackPublications.values()).some((publication) => publication.track?.kind === Track.Kind.Video))) {
          setStatus("Waiting for the robot camera stream...");
        }

        noVideoTimer = setTimeout(() => {
          if (!isMounted || videoConnected) {
            return;
          }
          room.disconnect();
          setIsViewing(false);
          setStatus("No active robot camera stream. Live view stopped.");
        }, 15000);
      } catch (error) {
        if (isMounted) {
          setIsViewing(false);
          setStatus(error instanceof Error ? error.message : "Could not connect to the live robot camera.");
        }
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (noVideoTimer) {
        clearTimeout(noVideoTimer);
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
      setMasterTracksByName(new Map());
      if (activeRoomRef.current === activeRoom) activeRoomRef.current = null;
      activeRoom?.disconnect();
    };
  }, [roomName, isViewing, receiveCapture, activeRobotModel]);

  useEffect(() => {
    if (!isViewing) {
      return;
    }

    function stopHiddenView() {
      if (document.hidden) {
        setIsViewing(false);
        setStatus("Live view paused because the tab is hidden.");
      }
    }

    document.addEventListener("visibilitychange", stopHiddenView);
    return () => document.removeEventListener("visibilitychange", stopHiddenView);
  }, [isViewing]);

  useEffect(() => {
    if (!isViewing || !containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setIsViewing(false);
          setStatus("Live view stopped because the camera is off screen.");
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isViewing]);

  function startViewing() {
    if (!livekitUrl || !hasActiveSession) {
      setStatus("Waiting for the scheduled session. Live view will start automatically.");
      return;
    }
    manuallyStoppedSessionIdRef.current = null;
    setStatus("Connecting to live robot camera...");
    setIsViewing(true);
  }

  function stopViewing() {
    manuallyStoppedSessionIdRef.current = viewingKey;
    setIsViewing(false);
    setStatus("Live view stopped.");
  }

  return (
    <div ref={containerRef}>
    {showMasterControls ? (
      <MasterLiveCameraControls
        preview={masterPreview && !isMasterSession}
        selection={masterSelection}
        onSelectionChange={changeMasterSelection}
      />
    ) : null}
    <div className={`mb-3 border px-4 py-3 text-sm leading-6 ${
      isMasterSession
        ? "border-[#31506a] bg-[#101d2e] text-[#dbeafe]"
        : isNaviSession
        ? "border-[#31506a] bg-[#101d2e] text-[#dbeafe]"
        : showLiveCapturePreview
          ? "border-[#31583a] bg-[#102015] text-[#dfffe0]"
          : "border-[#2a3440] bg-[#0d1117] text-[#aeb8c2]"
    }`}>
      {isMasterSession
        ? "Master live session: choose the four-camera wall or focus one approved color camera."
        : isNaviSession
        ? "Navi live session: live video only. Navi does not support Agentech.capture_image(), so no capture preview is shown."
        : showLiveCapturePreview
          ? "Aegies live session: display-mode captures appear beside the live stream and remain saved in the archive below."
          : "No active robot session. Saved Aegies captures remain available in the archive below."}
    </div>
    <div className={showLiveCapturePreview ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
      <div className={isMasterSession ? "relative min-h-64 w-full bg-black" : "relative aspect-video min-h-64 w-full bg-black"}>
        {isMasterSession ? (
          <MasterLivekitCameraGrid selection={masterSelection} tracksByName={masterTracksByName} />
        ) : (
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        )}
      {status === "Live robot camera connected." ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/75 px-6 text-center text-sm leading-6 text-[#aeb8c2]">
          <span aria-live="polite">{status}</span>
          <button
            type="button"
            onClick={startViewing}
            disabled={!livekitUrl || !hasActiveSession || isViewing}
            className="border border-[#8fdc8f] bg-[#17351f] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#dfffe0] transition hover:bg-[#8fdc8f] hover:text-[#08100a] disabled:cursor-not-allowed disabled:border-[#2a3440] disabled:bg-[#10151c] disabled:text-[#7f8c99]"
          >
            {hasActiveSession ? "Start Live View" : "Waiting for Scheduled Time"}
          </button>
        </div>
      )}
        {isViewing ? (
        <button
          type="button"
          onClick={stopViewing}
          className="absolute bottom-3 right-3 border border-[#93c5fd] bg-[#101d2e]/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#dbeafe] transition hover:bg-[#93c5fd] hover:text-[#07111f]"
        >
          Stop Live View
        </button>
        ) : null}
      </div>
      {showLiveCapturePreview ? (
      <div className="relative aspect-video min-h-64 overflow-hidden border border-[#2a3440] bg-[#080b0f]">
        {captureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captureUrl} alt="Latest image captured by Agentech.capture_image()" className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fdc8f]">Captured Image</p>
              <p className="mt-3 text-sm leading-6 text-[#aeb8c2]">
                Run <span className="font-mono text-white">Agentech.capture_image()</span> in the website code runner. The supervised runner stores the image safely and displays it here.
              </p>
            </div>
          </div>
        )}
        {captureUrl ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2 text-xs text-white">
            Latest capture{captureTime ? ` · ${new Date(captureTime).toLocaleTimeString()}` : ""}
          </div>
        ) : null}
      </div>
      ) : null}
    </div>
    {captureHistory.length ? (
      <section className="mt-3 border border-[#2a3440] bg-[#080b0f] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fdc8f]">Saved Aegies Captures</p>
            <p className="mt-1 text-xs text-[#aeb8c2]">These images stay available after an Aegies stream ends and remain downloadable during Navi sessions.</p>
          </div>
          <span className="text-xs text-[#aeb8c2]">{captureHistory.length} image{captureHistory.length === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...captureHistory].reverse().map((capture, index) => (
            <article key={capture.captureId} className="flex items-center gap-3 border border-[#25303b] bg-[#0d1218] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capture.dataUrl} alt={`Captured robot image ${captureHistory.length - index}`} className="h-16 w-24 shrink-0 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-white">Capture {captureHistory.length - index}</p>
                <p className="mt-1 text-[11px] text-[#8995a3]">{new Date(capture.createdAt).toLocaleString()}</p>
                <a
                  href={capture.dataUrl}
                  download={`agentech-capture-${capture.createdAt.replace(/[:.]/g, "-")}.${captureExtension(capture.dataUrl)}`}
                  className="mt-2 inline-block text-xs font-semibold text-[#93c5fd] underline-offset-4 hover:underline"
                >
                  Download image
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    ) : null}
    </div>
  );
}
