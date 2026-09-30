import type { MouseEvent } from "react";
import type { MotionProduct } from "@/lib/motion-store-data";
import { MotionPreviewView } from "./motion-preview";
import referenceStyles from "@/app/agentech-products/eais/eais-showcase.module.css";
import styles from "./motion-store.module.css";

type MotionCardProps = {
  motion: MotionProduct;
  variant: "featured" | "catalog";
  onView: (motion: MotionProduct, trigger: HTMLButtonElement) => void;
};

export function MotionCard({ motion, variant, onView }: MotionCardProps) {
  function viewMotion(event: MouseEvent<HTMLButtonElement>) {
    onView(motion, event.currentTarget);
  }

  return (
    <article
      data-motion-card
      data-motion-card-variant={variant}
      className={`${styles.card} ${variant === "featured" ? styles.featuredCard : styles.catalogCard}`}
    >
      <div className={styles.previewFrame}>
        <MotionPreviewView preview={motion.preview} name={motion.name} featured={variant === "featured"} />
      </div>
      <div className={`${referenceStyles.featureCardCopy} ${styles.cardBody}`}>
        <div>
          <small>{motion.category}</small>
          <h3 className={styles.cardTitle}>{motion.name}</h3>
        </div>
        <p className={styles.cardDescription}>{motion.description}</p>
        <div className={styles.cardFooter}>
          <button type="button" className={styles.viewButton} onClick={viewMotion} aria-label={`View ${motion.name}`}>
            View Motion <span className={styles.cardArrow} aria-hidden="true">↗</span>
          </button>
          <span className={styles.cardStatus}>{motion.status}</span>
        </div>
      </div>
    </article>
  );
}
