/** Subscription alone does not prove that the browser can display the video. */
export function observeFirstVideoFrame(video: HTMLVideoElement, onFrame: () => void) {
  let stopped = false;
  let callbackId: number | undefined;
  const complete = () => {
    if (stopped) return;
    stopped = true;
    onFrame();
  };
  const playing = () => {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) complete();
  };
  if (typeof video.requestVideoFrameCallback === "function") {
    callbackId = video.requestVideoFrameCallback(complete);
  } else {
    video.addEventListener("playing", playing);
    video.addEventListener("loadeddata", playing);
    playing();
  }
  return () => {
    stopped = true;
    if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId);
    video.removeEventListener("playing", playing);
    video.removeEventListener("loadeddata", playing);
  };
}
