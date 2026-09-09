"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  categoryLabels,
  filterEaisWorks,
  getEaisPaginationTokens,
  orderEaisWorksFeaturedFirst,
  paginateEaisWorks,
  prototypeWorks,
  workCategories,
  type PrototypeWork,
  type WorkCategory
} from "@/lib/eais-showcase";
import styles from "@/app/agentech-products/eais/eais-showcase.module.css";

const featuredWork = prototypeWorks.find((work) => work.isFeatured) ?? prototypeWorks[0];
const worksPerPage = 3;

const discoveryLinks = [
  ["Featured", "#featured-work"],
  ["Explore works", "#all-works"],
  ["How ideas take shape", "#how-it-works"]
] as const;

export function EaisShowcase() {
  const [activeCategory, setActiveCategory] = useState<WorkCategory>("for-you");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWork, setSelectedWork] = useState<PrototypeWork | null>(null);
  const featureStripRef = useRef<HTMLDivElement | null>(null);
  const activeTrigger = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (selectedWork && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [selectedWork]);

  const visibleWorks = useMemo(() => filterEaisWorks(activeCategory, query), [activeCategory, query]);
  const orderedWorks = useMemo(() => orderEaisWorksFeaturedFirst(visibleWorks), [visibleWorks]);
  const page = useMemo(() => paginateEaisWorks(orderedWorks, currentPage, worksPerPage), [orderedWorks, currentPage]);
  const paginationTokens = useMemo(() => getEaisPaginationTokens(page.currentPage, page.totalPages), [page.currentPage, page.totalPages]);

  function resetPage() {
    setCurrentPage(1);
    featureStripRef.current?.scrollTo({ left: 0, behavior: "instant" });
  }

  function selectPage(nextPage: number) {
    setCurrentPage(nextPage);
    featureStripRef.current?.scrollTo({ left: 0, behavior: "instant" });
  }

  function openWork(work: PrototypeWork, trigger: HTMLButtonElement) {
    activeTrigger.current = trigger;
    setSelectedWork(work);
  }

  function closeWork() {
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    setSelectedWork(null);
    requestAnimationFrame(() => activeTrigger.current?.focus());
  }

  return (
    <div data-eais-public-page className={styles.page}>
      <aside className={styles.sidebar}>
        <a href="#eais-home" className={styles.wordmark} aria-label="EAIS home">
          <span>AGENTECH</span><strong>EAIS</strong>
        </a>
        <p className={styles.sideLabel}>Discover projects</p>
        <nav className={styles.navigation} aria-label="EAIS page navigation">
          {discoveryLinks.map(([label, href]) => <a key={href} href={href}>{label}<span aria-hidden="true">↘</span></a>)}
        </nav>
        <p className={styles.sideNote}>Browse a visual concept library of robot work, outcomes, and the small choices behind them.</p>
      </aside>

      <main id="eais-home" className={styles.content}>
        <details className={styles.mobileNavigation}>
          <summary>Explore EAIS <span aria-hidden="true">+</span></summary>
          <nav aria-label="EAIS mobile navigation">
            {discoveryLinks.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>
        </details>

        <header data-eais-search className={styles.topBar}>
          <div className={styles.previewLabel}>CONCEPT PREVIEW <span>Image-led work library</span></div>
          <label className={styles.searchShell}>
            <span className={styles.searchLabel}>Search the concept library</span>
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Search an idea, robot, or scene" />
          </label>
        </header>

        <section className={styles.hero} aria-labelledby="eais-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>PROJECT SHOWCASE &amp; DISCOVERY</p>
            <h1 id="eais-title">See what robots can do next.</h1>
            <p>Start with an interesting result. Then look closer at the choices, scenes, and experiments that could bring it to life.</p>
            <a className={styles.primaryAction} href="#all-works">Explore the works <span aria-hidden="true">↓</span></a>
          </div>
          <button className={styles.heroFeature} type="button" onClick={(event) => openWork(featuredWork, event.currentTarget)} aria-haspopup="dialog">
            <Image src={featuredWork.image} alt={featuredWork.imageAlt} fill priority sizes="(max-width: 767px) 100vw, 45vw" />
            <span className={styles.heroFeatureShade} />
            <span className={styles.heroFeatureCopy}><small>FEATURED IDEA</small><strong>{featuredWork.title}</strong><em>See the story ↗</em></span>
          </button>
        </section>

        <section data-eais-category-tabs className={styles.categoryArea} aria-label="Robot work categories">
          <div className={styles.categoryTabs} role="tablist" aria-label="Filter works by robot type">
            {workCategories.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={activeCategory === category}
                className={activeCategory === category ? styles.activeTab : styles.categoryTab}
                onClick={() => { setActiveCategory(category); resetPage(); }}
              >
                {categoryLabels[category]}
              </button>
            ))}
          </div>
        </section>

        <section id="featured-work" data-eais-featured-work data-eais-work-grid className={styles.featured}>
          <span id="all-works" className={styles.anchorTarget} aria-hidden="true" />
          <div className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>START WITH A STORY</p><h2>Small scenes. Big ideas.</h2></div>
            <p>Find an outcome you want to understand, then open the work to see the human-scale process behind it.</p>
          </div>
          <p className={styles.paginationSummary} data-eais-pagination-summary aria-live="polite">
            {page.totalItems === 0 ? "Showing 0 of 0 works" : `Showing ${page.start}–${page.end} of ${page.totalItems} works`}
          </p>
          <div id="eais-feature-strip" data-eais-feature-strip data-eais-work-list data-eais-page-size={worksPerPage} ref={featureStripRef} className={styles.featureStrip}>
            {page.items.map((work) => (
              <button data-eais-work-card key={work.slug} type="button" className={styles.featureCard} onClick={(event) => openWork(work, event.currentTarget)} aria-haspopup="dialog">
                <span data-eais-cover-framing={work.slug === "prototype-gesture-lab" ? "full-body" : undefined} className={styles.featureImage}><Image src={work.image} alt={work.imageAlt} fill sizes="(max-width: 767px) 76vw, 28vw" /></span>
                <span className={styles.featureCardCopy}><small>{categoryLabels[work.category]}</small><strong>{work.title}</strong><em>{work.outcome}</em><b>Open story <span aria-hidden="true">↗</span></b></span>
              </button>
            ))}
            {page.totalItems === 0 ? <p className={styles.emptyResult}>No idea matches that search yet. Try a robot type or a simpler word.</p> : null}
          </div>
          <nav
            data-eais-pagination
            data-current-page={page.currentPage}
            data-total-pages={page.totalPages}
            className={styles.pagination}
            aria-label="Works pagination"
          >
            <button type="button" className={styles.paginationMove} aria-label="Previous page" disabled={page.currentPage <= 1 || page.totalPages === 0} onClick={() => selectPage(page.currentPage - 1)}><span className={styles.paginationLongLabel}>Previous</span><span className={styles.paginationCompactLabel} aria-hidden="true">←</span></button>
            <span className={styles.paginationPages}>
              {paginationTokens.map((token, index) => token === "ellipsis"
                ? <span key={`ellipsis-${index}`} className={styles.paginationEllipsis} aria-hidden="true">…</span>
                : <button
                    data-eais-page-number
                    data-compact={token !== 1 && token !== page.totalPages && Math.abs(token - page.currentPage) > 1 ? "hide" : undefined}
                    key={token}
                    type="button"
                    className={styles.paginationPage}
                    aria-label={`Page ${token}`}
                    aria-current={token === page.currentPage ? "page" : undefined}
                    onClick={() => selectPage(token)}
                  >{token}</button>)}
            </span>
            <button type="button" className={styles.paginationMove} aria-label="Next page" disabled={page.currentPage >= page.totalPages || page.totalPages === 0} onClick={() => selectPage(page.currentPage + 1)}><span className={styles.paginationLongLabel}>Next</span><span className={styles.paginationCompactLabel} aria-hidden="true">→</span></button>
          </nav>
        </section>

        <section id="how-it-works" data-eais-process className={styles.process}>
          <div className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>FROM IDEA TO EXHIBIT</p><h2>Give the work a story.</h2></div>
            <p>A look at the planned publishing flow. Submissions and review are not open in this prototype.</p>
          </div>
          <div className={styles.processGrid}>
            <article><span>01</span><h3>Submit</h3><p>Bring the project story, a demo, and a clear account of what was built and tested.</p></article>
            <article><span>02</span><h3>Review</h3><p>Check attribution, resource access, and the evidence behind the project’s claims.</p></article>
            <article><span>03</span><h3>Exhibit</h3><p>Publish a shareable project record so others can discover the work and learn from its process.</p></article>
          </div>
        </section>

        <footer className={styles.distinction}>
          <strong>EAIS is for discovering projects, cases, and how they are made.</strong>
          <span>NAVI STORE is for ready-to-use robot apps, games, and skills.</span>
        </footer>
      </main>

      <dialog
        ref={dialogRef}
        data-eais-work-dialog
        className={styles.dialog}
        aria-labelledby="eais-work-title"
        onClose={handleDialogClose}
        onClick={(event) => { if (event.target === event.currentTarget) closeWork(); }}
      >
        {selectedWork ? (
          <>
            <button type="button" className={styles.closeButton} onClick={closeWork} autoFocus aria-label="Close work detail">×</button>
            <div data-eais-cover-framing={selectedWork.slug === "prototype-gesture-lab" ? "full-body" : undefined} className={styles.dialogImage}><Image src={selectedWork.image} alt={selectedWork.imageAlt} fill sizes="(max-width: 767px) 100vw, 54vw" /></div>
            <div className={styles.dialogCopy}>
              <p className={styles.eyebrow}>{categoryLabels[selectedWork.category]} / CONCEPT RECORD</p>
              <h2 id="eais-work-title">{selectedWork.title}</h2>
              <p className={styles.dialogSummary}>{selectedWork.summary}</p>
              <Link data-eais-open-project className={styles.primaryAction} href={`/agentech-products/eais/projects/${selectedWork.slug}`}>Open full project <span aria-hidden="true">↗</span></Link>
              <div className={styles.outcome}><span>INTENDED OUTCOME</span><p>{selectedWork.outcome}</p></div>
              <div data-eais-work-team className={styles.teamInfo}><span>CREATOR / TEAM</span><p>Concept library template — contributor and team details will appear when a work is published.</p></div>
              <div className={styles.processList}><span>HOW IT TAKES SHAPE</span><ol>{selectedWork.process.map((step, index) => <li key={step}><b>{String(index + 1).padStart(2, "0")}</b>{step}</li>)}</ol></div>
            </div>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
