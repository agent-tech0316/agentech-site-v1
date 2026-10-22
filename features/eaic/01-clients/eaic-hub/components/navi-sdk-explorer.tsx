"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NaviFunction } from "@/features/eaic/02-unified-api/projects-validation/navi-sdk-reference";
import {
  buildNaviSearchIndex,
  buildPublicNaviReferences,
  getNaviCategoryCounts,
  NAVI_EXPLORER_CATEGORIES,
  searchNaviReferences,
  selectReviewedCommonTasks,
  type NaviCategory,
} from "@/features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer";
import { validateNaviSimulationMedia } from "@/features/eaic/01-clients/eaic-hub/contracts/navi-simulation-media";
import {
  parseNaviExplorerState,
  serializeNaviExplorerState,
  type NaviExplorerState,
} from "@/features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer-state";
import { NaviReferenceDetail } from "@/features/eaic/01-clients/eaic-hub/components/navi-reference-detail";

type ExplorerCategory = NaviCategory | "All";

export type NaviFunctionDetailViewedInput = Readonly<{
  robot: "navi";
  functionName: string;
}>;

export function NaviSdkExplorer({
  canonicalItems,
  globalSafetyLimits,
  onFunctionDetailViewed,
}: Readonly<{
  canonicalItems: readonly NaviFunction[];
  globalSafetyLimits: readonly string[];
  onFunctionDetailViewed?: (input: NaviFunctionDetailViewedInput) => void;
}>): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const references = useMemo(() => {
    const publicItems = buildPublicNaviReferences(canonicalItems);
    validateNaviSimulationMedia(publicItems);
    return publicItems;
  }, [canonicalItems]);
  const searchIndex = useMemo(() => buildNaviSearchIndex(references), [references]);
  const commonTasks = useMemo(() => selectReviewedCommonTasks(references), [references]);
  const primaryTasks = commonTasks.slice(0, 3);
  const secondaryTasks = commonTasks.slice(3);
  const canonicalNames = useMemo(() => new Set(references.map((reference) => reference.name)), [references]);
  const urlState = useMemo<NaviExplorerState>(() => {
    const parsed = parseNaviExplorerState(new URLSearchParams(searchParamsKey), canonicalNames);
    if (!parsed.openReferenceName) return parsed;
    const referenceRemainsVisible = searchNaviReferences(searchIndex, parsed.query, parsed.category)
      .some((result) => result.reference.name === parsed.openReferenceName);
    return referenceRemainsVisible ? parsed : Object.freeze({ query: "", category: "All", openReferenceName: parsed.openReferenceName });
  }, [canonicalNames, searchIndex, searchParamsKey]);
  const [query, setQuery] = useState(urlState.query);
  const [category, setCategory] = useState<ExplorerCategory>(urlState.category);
  const [openReferenceName, setOpenReferenceName] = useState<string | null>(urlState.openReferenceName);
  const [moreTasksOpen, setMoreTasksOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [announcedCount, setAnnouncedCount] = useState(references.length);
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>());
  const results = useMemo(() => searchNaviReferences(searchIndex, query, category), [searchIndex, query, category]);
  const counts = useMemo(() => getNaviCategoryCounts(searchIndex, query), [searchIndex, query]);

  useEffect(() => setHydrated(true), []);

  const hrefForState = useCallback((state: NaviExplorerState) => {
    const nextParams = serializeNaviExplorerState(new URLSearchParams(searchParamsKey), state);
    return nextParams.size ? `${pathname}?${nextParams.toString()}` : pathname;
  }, [pathname, searchParamsKey]);

  function commitExplicitState(state: NaviExplorerState) {
    setQuery(state.query);
    setCategory(state.category);
    setOpenReferenceName(state.openReferenceName);
    router.push(hrefForState(state), { scroll: false });
  }

  useEffect(() => {
    setQuery(urlState.query);
    setCategory(urlState.category);
    setOpenReferenceName(urlState.openReferenceName);

    const currentParams = new URLSearchParams(searchParamsKey);
    const canonicalParams = serializeNaviExplorerState(currentParams, urlState);
    if (canonicalParams.toString() !== currentParams.toString()) {
      router.replace(canonicalParams.size ? `${pathname}?${canonicalParams.toString()}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParamsKey, urlState]);

  useEffect(() => {
    if (query === urlState.query) return;
    const timeout = window.setTimeout(() => {
      const referenceRemainsVisible = openReferenceName
        ? searchNaviReferences(searchIndex, query, category).some((result) => result.reference.name === openReferenceName)
        : true;
      const nextState: NaviExplorerState = {
        query,
        category,
        openReferenceName: referenceRemainsVisible ? openReferenceName : null,
      };
      router.replace(hrefForState(nextState), { scroll: false });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [category, hrefForState, openReferenceName, query, router, searchIndex, urlState.query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setAnnouncedCount(results.length), 150);
    return () => window.clearTimeout(timeout);
  }, [results.length]);

  useEffect(() => {
    if (openReferenceName && !results.some((result) => result.reference.name === openReferenceName)) setOpenReferenceName(null);
  }, [openReferenceName, results]);

  const selectedReference = openReferenceName ? results.find((result) => result.reference.name === openReferenceName)?.reference ?? null : null;

  function focusReference(name: string, scroll = false) {
    window.requestAnimationFrame(() => {
      const toggle = toggleRefs.current.get(name);
      if (scroll) toggle?.scrollIntoView({ block: "center", behavior: "auto" });
      toggle?.focus();
    });
  }

  function closeReference(name: string) {
    commitExplicitState({ query, category, openReferenceName: null });
    focusReference(name);
  }

  function activateCommonTask(name: string) {
    commitExplicitState({ query: "", category: "All", openReferenceName: name });
    onFunctionDetailViewed?.({ robot: "navi", functionName: name });
    focusReference(name, true);
  }

  function selectCategory(nextCategory: ExplorerCategory) {
    if (nextCategory === category) return;
    const referenceRemainsVisible = openReferenceName
      ? searchNaviReferences(searchIndex, query, nextCategory).some((result) => result.reference.name === openReferenceName)
      : true;
    commitExplicitState({ query, category: nextCategory, openReferenceName: referenceRemainsVisible ? openReferenceName : null });
  }

  function clearSearch() {
    const referenceRemainsVisible = openReferenceName
      ? searchNaviReferences(searchIndex, "", category).some((result) => result.reference.name === openReferenceName)
      : true;
    commitExplicitState({ query: "", category, openReferenceName: referenceRemainsVisible ? openReferenceName : null });
  }

  function toggleReference(name: string) {
    const opening = openReferenceName !== name;
    commitExplicitState({ query, category, openReferenceName: openReferenceName === name ? null : name });
    if (opening) onFunctionDetailViewed?.({ robot: "navi", functionName: name });
  }

  function handleEscape(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !openReferenceName) return;
    event.preventDefault();
    closeReference(openReferenceName);
  }

  const emptyCategoryLabel = category === "All" ? "All categories" : category;

  return (
    <section data-navi-sdk-explorer="true" data-navi-hydrated={hydrated ? "true" : "false"} data-sdk-documentation-region="true" onKeyDown={handleEscape} className="mt-6 overflow-hidden rounded-[22px] border border-black/8 bg-white/70 font-interface shadow-[0_20px_55px_rgba(17,17,17,0.06)]">
      <div className="border-b border-black/8 bg-[#f5f4f1] px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">Navi SDK Explorer</p>
            <h2 data-navi-explorer-title="true" className="mt-2 text-2xl font-semibold text-[#111111]">Start with a task, then inspect one exact reference.</h2>
          </div>
          <p className="text-sm font-semibold text-[#526174]">{references.length} canonical references</p>
        </div>

        <div data-navi-search-controls="true" className="mt-5">
          <label className="block min-w-0 text-sm font-semibold text-[#111111]">
            Search Navi references
            <input type="search" value={query} maxLength={120} data-navi-search-input="true" aria-describedby="navi-search-description" onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-11 w-full rounded-[12px] border border-black/15 bg-white px-3 py-2 font-interface text-sm text-[#111111] outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]" placeholder="Function, task, parameter, profile…" />
          </label>
          <p id="navi-search-description" className="mt-2 text-xs leading-5 text-[#526174]">Searches reviewed public names, callables, signatures, task language, parameters, profiles, notes, returns, and examples.</p>
          <div data-navi-category-filters="true" role="group" aria-label="Filter Navi references by category" className="mt-3 flex flex-wrap gap-2">
            {(["All", ...NAVI_EXPLORER_CATEGORIES] as const).map((option) => (
              <button key={option} type="button" data-navi-category-filter={option} data-navi-category-count={counts[option]} aria-pressed={category === option} onClick={() => selectCategory(option)} className={`min-h-11 rounded-full border px-3 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2 ${category === option ? "border-[#1a73e8] bg-[#1a73e8] text-white" : "border-black/10 bg-white text-[#334155]"}`}>
                {option} · {counts[option]}
              </button>
            ))}
          </div>
          <p data-navi-result-count="true" aria-live="polite" className="mt-3 text-sm font-semibold text-[#334155]">{announcedCount} Navi references</p>
        </div>
      </div>

      <section data-navi-quick-start="true" aria-labelledby="navi-quick-start-heading" className="border-b border-black/8 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="navi-quick-start-heading" className="text-sm font-semibold text-[#111111]">Quick Start</h3>
            <p className="mt-1 text-xs leading-5 text-[#526174]">Open one reviewed task, then inspect its exact public SDK reference.</p>
          </div>
          <button
            type="button"
            data-navi-more-tasks-toggle="true"
            aria-expanded={moreTasksOpen}
            aria-controls="navi-more-tasks"
            onClick={() => setMoreTasksOpen((open) => !open)}
            className="min-h-11 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-[#334155] outline-none transition motion-reduce:transition-none hover:border-[#1a73e8]/50 focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2"
          >
            More tasks
          </button>
        </div>
        <div data-navi-quick-start-primary="true" className="mt-3 grid gap-2 sm:grid-cols-3">
          {primaryTasks.map((reference) => (
            <button key={reference.name} type="button" data-navi-common-task={reference.name} onClick={() => activateCommonTask(reference.name)} className="min-h-11 rounded-[12px] border border-black/10 bg-white px-3 py-3 text-left outline-none transition motion-reduce:transition-none hover:border-[#1a73e8]/50 focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2">
              <span data-navi-common-task-label="true" className="block text-sm font-semibold text-[#111111]">{reference.discovery!.taskLabel}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#526174]">
                <code data-sdk-typeface="code" className="font-mono text-[#1a73e8]">{reference.name}</code>
                <span>{reference.category}</span>
                {reference.access?.tier === "premium" ? <span>Premium</span> : null}
                {reference.creditUsage === "high" ? <span>High credit usage</span> : null}
              </span>
            </button>
          ))}
        </div>
        {moreTasksOpen ? (
          <div id="navi-more-tasks" data-navi-quick-start-secondary="true" role="region" aria-label="More reviewed Navi tasks" className="mt-3 grid gap-2 border-t border-black/8 pt-3 sm:grid-cols-3">
            {secondaryTasks.map((reference) => (
              <button key={reference.name} type="button" data-navi-common-task={reference.name} onClick={() => activateCommonTask(reference.name)} className="min-h-11 rounded-[12px] border border-black/10 bg-white px-3 py-3 text-left outline-none transition motion-reduce:transition-none hover:border-[#1a73e8]/50 focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2">
                <span data-navi-common-task-label="true" className="block text-sm font-semibold text-[#111111]">{reference.discovery!.taskLabel}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#526174]">
                  <code data-sdk-typeface="code" className="font-mono text-[#1a73e8]">{reference.name}</code>
                  <span>{reference.category}</span>
                  {reference.access?.tier === "premium" ? <span>Premium</span> : null}
                  {reference.creditUsage === "high" ? <span>High credit usage</span> : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 px-4 py-4 sm:px-5">
        <div>
          <h3 className="text-lg font-semibold text-[#111111]">API References</h3>
          <p className="mt-1 text-xs text-[#526174]">{results.length} matching references</p>
        </div>
        {(query || category !== "All") ? (
          <div className="flex flex-wrap gap-2">
            {query ? <button type="button" onClick={clearSearch} className="min-h-11 rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-[#334155]">Clear search</button> : null}
            {category !== "All" ? <button type="button" onClick={() => selectCategory("All")} className="min-h-11 rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-[#334155]">Show all categories</button> : null}
          </div>
        ) : null}
      </div>

      {results.length ? (
        <div data-navi-reference-workspace="true" className="lg:grid lg:grid-cols-[minmax(280px,0.36fr)_minmax(0,0.64fr)]">
          <div className={selectedReference ? "hidden lg:block" : "block"}>
            <div data-navi-reference-index="true" className="divide-y divide-black/8 lg:max-h-[min(72vh,880px)] lg:overflow-y-auto lg:overscroll-contain">
              {results.map(({ reference }) => {
                const selected = selectedReference?.name === reference.name;
                const detailId = `navi-reference-detail-${reference.name}`;
                return (
                  <div key={reference.name} data-navi-reference-row="true" data-navi-reference-name={reference.name} data-navi-reference-category={reference.category}>
                    <button
                      ref={(node) => { if (node) toggleRefs.current.set(reference.name, node); else toggleRefs.current.delete(reference.name); }}
                      type="button"
                      data-navi-reference-toggle="true"
                      data-navi-reference-selected={selected ? "true" : "false"}
                      aria-pressed={selected}
                      aria-controls={detailId}
                      onClick={() => toggleReference(reference.name)}
                      className={`min-h-16 w-full border-l-4 px-4 py-3 text-left outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a73e8] sm:px-5 ${selected ? "border-l-[#1a73e8] bg-[var(--color-surface)]" : "border-l-transparent hover:bg-white"}`}
                    >
                      <span className="flex min-w-0 items-start justify-between gap-3">
                        <span className="min-w-0">
                          <code data-navi-reference-name-label="true" data-sdk-typeface="code" className="block min-w-0 break-words font-mono text-sm font-semibold text-[#1a73e8] [overflow-wrap:anywhere]">{reference.name}</code>
                          <span data-navi-reference-category-label="true" className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526174]">{reference.category}</span>
                        </span>
                        <span data-navi-selected-indicator="true" className="shrink-0 rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-semibold text-[#334155]">{selected ? "Selected" : "View"}</span>
                      </span>
                      <span data-navi-reference-summary="true" className="mt-2 block text-xs leading-5 text-[#303134]">{reference.summary}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div data-navi-desktop-detail="true" className={selectedReference ? "block" : "hidden lg:block"}>
            <div className="min-w-0 border-black/8 lg:border-l">
              {selectedReference ? (
                <NaviReferenceDetail reference={selectedReference} globalSafetyLimits={globalSafetyLimits} onRequestClose={() => closeReference(selectedReference.name)} />
              ) : (
                <div data-navi-detail-placeholder="true" className="grid min-h-[320px] place-items-center px-6 py-12 text-center">
                  <div>
                    <p className="text-base font-semibold text-[#111111]">Select a reference to view its documentation.</p>
                    <p className="mt-2 text-sm leading-6 text-[#526174]">Choose any API from the index without changing your search or category.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div data-navi-empty-state="true" className="px-4 py-10 text-center sm:px-5">
          <p className="text-base font-semibold text-[#111111]">No Navi references match “{query}” in {emptyCategoryLabel}.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {query ? <button type="button" onClick={clearSearch} className="min-h-11 rounded-full border border-[#1a73e8] px-4 py-2 text-sm font-semibold text-[#1a73e8]">Clear search</button> : null}
            {category !== "All" ? <button type="button" onClick={() => selectCategory("All")} className="min-h-11 rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white">Show all categories</button> : null}
          </div>
        </div>
      )}
    </section>
  );
}
