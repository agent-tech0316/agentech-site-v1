"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { MotionProduct } from "@/lib/motion-store-data";
import { featuredMotions, motionCatalog, motionCategories } from "@/lib/motion-store-data";
import { filterMotions, type MotionFilterCategory } from "@/lib/motion-store-filter";
import { MotionCard } from "./motion-card";
import { MotionDetailModal } from "./motion-detail-modal";
import referenceStyles from "@/app/agentech-products/eais/eais-showcase.module.css";
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
      <div className={referenceStyles.content} data-motion-content>
        <header className={referenceStyles.topBar} data-motion-search>
          <div className={referenceStyles.previewLabel}>SKILLS MARKET <span>ROBOT MOTION LIBRARY</span></div>
          <label className={referenceStyles.searchShell}>
            <span className={referenceStyles.searchLabel}>Search motions</span>
            <span aria-hidden="true">⌕</span>
            <input
              id="motion-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search motions"
              aria-label="Search motions"
            />
          </label>
        </header>

        <section className={styles.intro} aria-labelledby="motion-store-title">
          <p className={referenceStyles.eyebrow}>SKILLS MARKET</p>
          <h1 id="motion-store-title" className={referenceStyles.librarySectionTitle}>Motion, ready to move.</h1>
          <p className={styles.introLead}>A library of robot-ready movement.</p>
          <p className={styles.introSupport}>Browse, preview, and discover motion for your robot.</p>
        </section>

        <section id="motion-featured" className={styles.section} aria-labelledby="featured-motions-title">
          <div className={referenceStyles.sectionHeader}>
            <div>
              <p className={referenceStyles.eyebrow}>01 / CURATED</p>
              <h2 id="featured-motions-title">Featured Motions</h2>
            </div>
            <span className={styles.railHint}>Scroll to explore</span>
          </div>
          <div className={styles.featuredRail} data-motion-featured-rail>
            {featuredMotions.map((motion) => (
              <MotionCard key={motion.id} motion={motion} variant="featured" onView={openMotion} />
            ))}
          </div>
        </section>

        <section id="motion-library" className={styles.section} aria-labelledby="browse-motions-title">
          <div className={referenceStyles.sectionHeader}>
            <div>
              <p className={referenceStyles.eyebrow}>02 / LIBRARY</p>
              <h2 id="browse-motions-title">Browse Motions</h2>
            </div>
            <span className={styles.resultCount} aria-live="polite">{filteredMotions.length.toString().padStart(2, "0")} motions</span>
          </div>

          <div className={styles.catalogControls}>
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
              <p className={referenceStyles.eyebrow}>NO MATCH / 404</p>
              <h3 className={styles.cardTitle}>No motions found</h3>
              <p>Try another search or reset the current category.</p>
              <button type="button" className={styles.viewButton} onClick={clearFilters}>Clear filters</button>
            </div>
          )}
        </section>
      </div>

      {selectedMotion ? <MotionDetailModal motion={selectedMotion} onClose={closeMotion} /> : null}
    </div>
  );
}
