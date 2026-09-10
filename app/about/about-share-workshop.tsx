import { AboutStoryFramePlayer } from "./about-story-frame-player";

const shareFrames = [
  "/assets/about/share-story-frames-v3/frame-00.webp",
  "/assets/about/share-story-frames-v3/frame-01.webp",
  "/assets/about/share-story-frames-v3/frame-02.webp",
  "/assets/about/share-story-frames-v3/frame-03.webp",
  "/assets/about/share-story-frames-v3/frame-04.webp",
  "/assets/about/share-story-frames-v3/frame-05.webp",
  "/assets/about/share-story-frames-v3/frame-06.webp",
  "/assets/about/share-story-frames-v3/frame-07.webp",
  "/assets/about/share-story-frames-v3/frame-08.webp",
  "/assets/about/share-story-frames-v3/frame-09.webp",
  "/assets/about/share-story-frames-v3/frame-10.webp",
  "/assets/about/share-story-frames-v3/frame-11.webp",
  "/assets/about/share-story-frames-v3/frame-12.webp",
  "/assets/about/share-story-frames-v3/frame-13.webp",
  "/assets/about/share-story-frames-v3/frame-14.webp",
  "/assets/about/share-story-frames-v3/frame-15.webp",
  "/assets/about/share-story-frames-v3/frame-16.webp",
  "/assets/about/share-story-frames-v3/frame-17.webp",
  "/assets/about/share-story-frames-v3/frame-18.webp",
  "/assets/about/share-story-frames-v3/frame-19.webp",
  "/assets/about/share-story-frames-v3/frame-20.webp",
  "/assets/about/share-story-frames-v3/frame-21.webp",
  "/assets/about/share-story-frames-v3/frame-22.webp",
  "/assets/about/share-story-frames-v3/frame-23.webp",
  "/assets/about/share-story-frames-v3/frame-24.webp",
  "/assets/about/share-story-frames-v3/frame-25.webp",
  "/assets/about/share-story-frames-v3/frame-26.webp",
  "/assets/about/share-story-frames-v3/frame-27.webp",
  "/assets/about/share-story-frames-v3/frame-28.webp",
  "/assets/about/share-story-frames-v3/frame-29.webp",
  "/assets/about/share-story-frames-v3/frame-30.webp",
  "/assets/about/share-story-frames-v3/frame-31.webp",
  "/assets/about/share-story-frames-v3/frame-32.webp",
  "/assets/about/share-story-frames-v3/frame-33.webp",
  "/assets/about/share-story-frames-v3/frame-34.webp",
  "/assets/about/share-story-frames-v3/frame-35.webp"
] as const;

export function ShareWorkshop() {
  return (
    <AboutStoryFramePlayer
      story="share"
      label="Share"
      frames={shareFrames}
      frameIntervalMs={80}
    />
  );
}
