"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import type { MotionProduct } from "@/lib/motion-store-data";
import { MotionPreviewView } from "./motion-preview";
import styles from "./motion-store.module.css";

type MotionDetailModalProps = {
  motion: MotionProduct;
  onClose: () => void;
};

export function MotionDetailModal({ motion, onClose }: MotionDetailModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `motion-detail-${motion.id}`;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  const metadata = [
    ["Motion Type", motion.metadata.motionType],
    ["Duration", motion.metadata.duration],
    ["Robot Compatibility", motion.metadata.compatibility],
    ["Format", motion.metadata.format],
    ["Version", motion.metadata.version]
  ];

  return (
    <div className={styles.modalBackdrop} onMouseDown={closeFromBackdrop} data-motion-modal-backdrop>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-motion-modal
      >
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Close motion details"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className={styles.modalPreview}>
          <MotionPreviewView preview={motion.preview} name={motion.name} featured />
        </div>

        <div className={styles.modalContent}>
          <p className={styles.modalEyebrow}>{motion.category}</p>
          <h2 id={titleId} className={styles.modalTitle}>{motion.name}</h2>
          <p className={styles.modalDescription}>{motion.description}</p>
          <dl className={styles.metadataGrid}>
            {metadata.map(([label, value]) => (
              <div key={label} className={styles.metadataRow}>
                <dt>{label}</dt>
                <dd>{value || "Pending"}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={styles.comingSoonButton} disabled>
            Coming Soon
          </button>
        </div>
      </section>
    </div>
  );
}
