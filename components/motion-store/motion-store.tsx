"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { MotionProduct } from "@/lib/motion-store-data";
import { featuredMotions, motionCatalog, motionCategories } from "@/lib/motion-store-data";
import { filterMotions, type MotionFilterCategory } from "@/lib/motion-store-filter";
import { MotionCard } from "./motion-card";
import { MotionDetailModal } from "./motion-detail-modal";
import styles from "./motion-store.module.css";

const filterCategories: readonly MotionFilterCategory[] = ["All", ...motionCategories];

export function MotionStore() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MotionFilterCategory>("All");
  const [selectedMotion, setSelectedMotion] = useState<MotionProduct | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const filteredMotions = useMemo(
    () => filterMotions(motionCatalog, query, category),
    [query, category]
  );

  const openMotion = useCallback((motion: MotionProduct, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelectedMotion(motion);
  }, []);

  const closeMotion = useCallback(() => {
    setSelectedMotion(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  function clearFilters() {
    setQuery("");
    setCategory("All");
  }

  return (
    <div className={styles.store} data-motion-store>
      <section className={styles.intro} aria-labelledby="motion-store-title">
        <p className={styles.eyebrow}><span aria-hidden="true" />MOTION STORE</p>
        <h1 id="motion-store-title">Motion, ready to move.</h1>
        <p className={styles.introLead}>A library of robot-ready movement.</p>
        <p className={styles.introSupport}>Browse, preview, and discover motion for your robot.</p>
      </section>

      <section className={styles.section} aria-labelledby="featured-motions-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionIndex}>01 / CURATED</p>
            <h2 id="featured-motions-title">Featured Motions</h2>
          </div>
          <p className={styles.railHint}>Scroll to explore</p>
        </div>
        <div className={styles.featuredRail} data-motion-featured-rail>
          {featuredMotions.map((motion) => (
            <MotionCard key={motion.id} motion={motion} variant="featured" onView={openMotion} />
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.browseSection}`} aria-labelledby="browse-motions-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionIndex}>02 / CATALOG</p>
            <h2 id="browse-motions-title">Browse Motions</h2>
          </div>
          <p className={styles.resultCount}>{filteredMotions.length.toString().padStart(2, "0")} motions</p>
        </div>

        <div className={styles.catalogControls}>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search motions</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search motions"
              aria-label="Search motions"
            />
          </label>

          <div className={styles.categoryRail} aria-label="Motion categories" data-motion-category-rail>
            {filterCategories.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.categoryChip}
                data-active={category === value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {filteredMotions.length > 0 ? (
          <div className={styles.catalogGrid} data-motion-catalog-grid>
            {filteredMotions.map((motion) => (
              <MotionCard key={motion.id} motion={motion} variant="catalog" onView={openMotion} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <p className={styles.emptyCode}>NO MATCH / 404</p>
            <h3>No motions found</h3>
            <p>Try another search or reset the current category.</p>
            <button type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        )}
      </section>

      {selectedMotion ? <MotionDetailModal motion={selectedMotion} onClose={closeMotion} /> : null}
    </div>
  );
}
