"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MotionProduct } from "@/lib/motion-store-data";
import { featuredMotions, motionCatalog, motionCategories } from "@/lib/motion-store-data";
import { filterMotions, type MotionFilterCategory } from "@/lib/motion-store-filter";
import { MotionCard } from "./motion-card";
import { MotionDetailModal } from "./motion-detail-modal";
import referenceStyles from "@/app/agentech-products/eais/eais-showcase.module.css";
import styles from "./motion-store.module.css";

const filterCategories: readonly MotionFilterCategory[] = ["All", ...motionCategories];
const marketCategories = motionCategories.map((label) => ({
  label,
  count: motionCatalog.filter((motion) => motion.category === label).length
}));

export function MotionStore() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MotionFilterCategory>("All");
  const [selectedMotion, setSelectedMotion] = useState<MotionProduct | null>(null);
  const [activeSection, setActiveSection] = useState<"featured" | "library">("featured");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const featuredRef = useRef<HTMLElement | null>(null);
  const libraryRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const filteredMotions = useMemo(
    () => filterMotions(motionCatalog, query, category),
    [query, category]
  );

  useEffect(() => {
    if (!featuredRef.current || !libraryRef.current) return;
    const observer = new IntersectionObserver(() => {
      const libraryTop = libraryRef.current?.getBoundingClientRect().top ?? Infinity;
      setActiveSection(libraryTop <= window.innerHeight / 2 ? "library" : "featured");
    }, { rootMargin: "-184px 0px -50% 0px", threshold: 0 });
    observer.observe(featuredRef.current);
    observer.observe(libraryRef.current);
    return () => observer.disconnect();
  }, []);

  function scrollToSection(section: HTMLElement | null) {
    section?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  }

  function browseCategory(value: MotionFilterCategory) {
    setCategory(value);
    setActiveSection("library");
    scrollToSection(libraryRef.current);
  }

  function focusLibrarySearch() {
    browseCategory("All");
    searchRef.current?.focus({ preventScroll: true });
  }

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
      <aside className={styles.layoutGutter} aria-label="Market navigation">
        <nav className={styles.marketIndex} aria-label="Market index" data-motion-market-index>
          <div className={styles.indexHeading}>
            <h2 className={styles.indexEyebrow}>MARKET INDEX</h2>
            <span className={styles.indexNumber} aria-label={`${motionCatalog.length} motions in the library`}>
              {motionCatalog.length.toString().padStart(3, "0")}
            </span>
          </div>
          <div className={styles.indexRows}>
            <button
              type="button"
              className={styles.indexItem}
              aria-label={`Featured, ${featuredMotions.length} motions`}
              aria-controls="motion-featured"
              aria-current={activeSection === "featured" ? "location" : undefined}
              onClick={() => { setActiveSection("featured"); scrollToSection(featuredRef.current); }}
            >
              <span className={styles.indexNumber} aria-hidden="true">01</span>
              <span className={styles.indexLabel}>Featured</span>
              <span className={styles.indexNumber} aria-hidden="true">{featuredMotions.length.toString().padStart(2, "0")}</span>
            </button>
            {marketCategories.map(({ label, count }, index) => (
              <button
                key={label}
                type="button"
                className={styles.indexItem}
                aria-label={`${label}, ${count} motions`}
                aria-controls="motion-library"
                aria-current={activeSection === "library" && category === label ? "location" : undefined}
                onClick={() => browseCategory(label)}
              >
                <span className={styles.indexNumber} aria-hidden="true">{(index + 2).toString().padStart(2, "0")}</span>
                <span className={styles.indexLabel}>{label}</span>
                <span className={styles.indexNumber} aria-hidden="true">{count.toString().padStart(2, "0")}</span>
              </button>
            ))}
          </div>
          <button type="button" className={styles.indexSearch} aria-controls="motion-search-input" onClick={focusLibrarySearch}>
            SEARCH THE LIBRARY <span aria-hidden="true">→</span>
          </button>
        </nav>
      </aside>
      <div className={referenceStyles.content} data-motion-content>
        <header className={referenceStyles.topBar} data-motion-search>
          <div className={referenceStyles.previewLabel}>MOTION STORE <span>ROBOT MOTION LIBRARY</span></div>
          <label className={referenceStyles.searchShell}>
            <span className={referenceStyles.searchLabel}>Search motions</span>
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
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
          <p className={referenceStyles.eyebrow}>MOTION STORE</p>
          <h1 id="motion-store-title" className={referenceStyles.librarySectionTitle}>Motion, ready to move.</h1>
          <p className={styles.introLead}>A library of robot-ready movement.</p>
          <p className={styles.introSupport}>Browse, preview, and discover motion for your robot.</p>
        </section>

        <section ref={featuredRef} id="motion-featured" className={styles.section} aria-labelledby="featured-motions-title">
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

        <section ref={libraryRef} id="motion-library" className={styles.section} aria-labelledby="browse-motions-title">
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
