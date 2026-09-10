import { AboutStoryFramePlayer } from "./about-story-frame-player";

const buildFrames = [
  "/assets/about/build-story-frames-v2/frame-00.png",
  "/assets/about/build-story-frames-v2/frame-01.png",
  "/assets/about/build-story-frames-v2/frame-01b.png",
  "/assets/about/build-story-frames-v2/frame-02.png"
] as const;

export function BuildWorkshop() {
  return (
    <AboutStoryFramePlayer
      story="build"
      label="Build"
      frames={buildFrames}
      frameIntervalMs={350}
    />
  );
}
