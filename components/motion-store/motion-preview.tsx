import Image from "next/image";
import type { MotionPreview } from "@/lib/motion-store-data";
import styles from "./motion-store.module.css";

type MotionPreviewViewProps = {
  preview: MotionPreview;
  name: string;
  featured?: boolean;
};

const paths = {
  arc: "M38 178 C96 38 212 42 286 154",
  stride: "M24 164 C88 126 138 202 202 154 S284 92 324 126",
  burst: "M20 178 C82 168 120 130 158 80 S252 44 330 62",
  wave: "M42 164 C92 110 132 196 182 134 S270 48 324 94",
  impact: "M34 150 C106 148 138 98 190 98 S252 124 326 68",
  rhythm: "M24 150 C58 62 104 212 150 112 S230 54 282 140 S318 152 336 108",
  reach: "M34 178 C92 178 116 152 152 126 S228 70 322 72",
  lower: "M32 76 C116 78 138 96 178 132 S246 178 326 178",
  rise: "M32 178 C112 176 140 150 180 112 S246 74 326 72"
} as const;

export function MotionPreviewView({ preview, name, featured = false }: MotionPreviewViewProps) {
  if (preview.type === "image" && preview.src) {
    return (
      <Image
        data-motion-preview
        src={preview.src}
        alt={`${name} motion preview`}
        width={1280}
        height={960}
        sizes={featured ? "(min-width: 1024px) 620px, 72vw" : "(min-width: 1380px) 25vw, (min-width: 640px) 50vw, 100vw"}
      />
    );
  }

  if (preview.type === "video" && preview.src) {
    return <video data-motion-preview src={preview.src} aria-label={`${name} motion preview`} muted loop playsInline />;
  }

  const motif = preview.type === "placeholder" ? preview.motif : "arc";

  return (
    <div
      data-motion-preview
      data-motion-preview-fallback
      data-motion-motif={motif}
      className={`${styles.previewInner} ${featured ? styles.featuredPreview : styles.catalogPreview}`}
      role="img"
      aria-label={`${name} motion preview coming soon`}
    >
      <span className={styles.previewGrid} aria-hidden="true" />
      <svg viewBox="0 0 360 240" aria-hidden="true" focusable="false">
        <path className={styles.trajectoryGhost} d={paths[motif]} pathLength="1" />
        <path className={styles.trajectory} d={paths[motif]} pathLength="1" />
        <g className={styles.joints}>
          <circle cx="180" cy="70" r="12" />
          <circle cx="180" cy="104" r="7" />
          <circle cx="143" cy="118" r="7" />
          <circle cx="217" cy="118" r="7" />
          <circle cx="158" cy="166" r="7" />
          <circle cx="202" cy="166" r="7" />
          <path d="M180 82v53m-37-17 37-14 37 14m-37 17-22 31m22-31 22 31" />
        </g>
      </svg>
      <span className={styles.previewCode} aria-hidden="true">MOTION / {motif.toUpperCase()}</span>
    </div>
  );
}
