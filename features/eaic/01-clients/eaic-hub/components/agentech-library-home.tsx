import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { InteractiveDogHero } from "@/features/eaic/01-clients/eaic-hub/components/interactive-dog-hero";
import { aegisFunctions } from "@/features/eaic/02-unified-api/projects-validation/aegis-sdk-reference";
import { agentechLibraryTasks } from "@/features/eaic/01-clients/eaic-hub/contracts/agentech-library-tasks";
import { getEaicHubTaskPath } from "@/features/eaic/01-clients/eaic-hub/contracts/eaic-hub";
import { workflowAccentPalette } from "@/lib/eaic-workflow-palette";

const footerStats = [
  ["Code validation", "Validate movement before hardware execution"],
  ["10s max", "Per linear motion command"],
  ["Emergency stop", "Available throughout supervised runs"],
  ["Speed capped", "Safety limits enforced by the platform"]
];

function StepIcon({ index }: { index: number }) {
  const icons = [
    <svg key="code" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="10" width="48" height="40" rx="3" />
      <path d="M20 32l8-8M20 32l8 8M44 24l-8 8M44 40l-8-8" />
      <path d="M14 18h4M24 18h4M34 18h4" />
    </svg>,
    <svg key="cube" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M32 6l24 13v27L32 58 8 46V19L32 6z" />
      <path d="M8 19l24 13 24-13M32 32v26" />
      <path d="M20 13l24 13M44 13L20 26" />
    </svg>,
    <svg key="shield" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M32 6l21 8v15c0 14-8.5 23-21 29-12.5-6-21-15-21-29V14l21-8z" />
      <path d="M22 33l7 7 14-16" />
    </svg>,
    <svg key="live" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="16" width="38" height="32" rx="4" />
      <path d="M47 27l8-5v20l-8-5" />
      <circle cx="28" cy="32" r="8" />
      <path d="M25 29l7 3-7 3v-6z" fill="currentColor" stroke="none" />
    </svg>
  ];

  return <div className="h-12 w-12">{icons[index]}</div>;
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

export function AgentechLibraryHome() {
  return (
    <div className="agentech-library-page eaic-engineering-theme min-h-screen overflow-hidden bg-[#020609] text-[#dbe7f2]">
      <section
        aria-labelledby="eaic-hub-title"
        data-eaic-hero
        className="relative isolate min-h-[calc(100svh-72px)] overflow-hidden border-b border-white/10 bg-[#020609]"
      >
        <InteractiveDogHero />
        <div
          data-eaic-hero-overlay
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        />

        <div data-eaic-hero-content className="relative mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-7xl items-start px-5 pb-[38vh] pt-14 sm:px-8 md:items-center md:py-20">
          <div className="max-w-2xl">
            <p className="font-interface text-[11px] font-medium uppercase tracking-[0.28em] text-[#80d8f4] sm:text-xs">
              Embodied AI command infrastructure
            </p>
            <h1 id="eaic-hub-title" className="mt-8">
              <span className="block w-[min(78vw,30rem)]">
                <Image
                  data-hero-optical-align="image-mark"
                  src="/assets/products/agentech-library/eaic-logo-white.png"
                  alt="EAIC"
                  width={1880}
                  height={434}
                  sizes="(min-width: 1024px) 480px, 78vw"
                  className="eaic-hub-logo h-auto w-full"
                  priority
                />
              </span>
              <span data-eaic-hub-word data-hero-optical-align="display-title" className="font-display eaic-hub-word mt-3 block text-5xl font-medium tracking-[-0.075em] text-white sm:text-7xl lg:text-8xl">
                HUB
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-sm leading-7 text-[#a7b2bd] sm:text-base sm:leading-8">
              One technical workspace for robot SDK references, code certification, scheduling, and supervised live execution.
            </p>
            <div data-eaic-hero-actions className="mt-8 flex flex-wrap gap-3">
              <Link
                href={getEaicHubTaskPath("start-coding")}
                data-eaic-primary-action
                className="font-interface inline-flex min-h-11 items-center gap-3 rounded-xl bg-[#e6edf2] px-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#071017] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef]"
              >
                Enter workflow <ArrowIcon />
              </Link>
              <Link
                href={getEaicHubTaskPath("view-sdk")}
                data-eaic-secondary-action
                className="font-interface inline-flex min-h-11 items-center gap-3 rounded-xl border border-white/25 bg-black/10 px-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#c3ced8] backdrop-blur-sm transition hover:border-[#83c8ef] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef]"
              >
                View SDK <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-14 sm:px-8 lg:pb-24 lg:pt-20">
        <section className="mt-14 overflow-hidden rounded-xl border border-[#174766] bg-[#02070b] shadow-[0_36px_100px_rgba(0,0,0,0.36)]" aria-labelledby="workflow-title">
          <div className="border-b border-[#284354] bg-[#061722] px-6 py-7 sm:px-8">
            <p id="workflow-title" className="font-interface text-sm font-medium uppercase tracking-[0.22em] text-[#80d8f4]">Developer workflow</p>
          </div>
          <ol data-workflow-flow className="bg-[#03070a] p-4 sm:p-6 lg:p-8">
            {agentechLibraryTasks.map((task, index) => {
              const accent = workflowAccentPalette[index];
              return (
                <li
                  key={task.slug}
                  data-workflow-step={task.number}
                  style={{
                    "--workflow-accent-dark": accent.dark,
                    "--workflow-accent-light": accent.light
                  } as CSSProperties}
                >
                  <Link
                    data-flow-card
                    href={getEaicHubTaskPath(task.slug)}
                    className="group grid overflow-hidden rounded-xl border border-[#223947] bg-[#050b10] transition duration-300 hover:-translate-y-0.5 hover:border-[#4c7087] hover:bg-[#08131b] hover:shadow-[0_22px_60px_rgba(0,0,0,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef] md:min-h-[190px] md:grid-cols-[13rem_minmax(0,1fr)_20rem] md:items-stretch"
                  >
                    <div className="flex items-center gap-5 border-b border-[#24323b] p-6 md:border-b-0 md:border-r">
                      <span
                        data-eaic-step-number
                        data-workflow-accent-box
                        className="font-technical grid h-16 w-16 shrink-0 place-items-center rounded-lg border text-2xl font-semibold shadow-[0_12px_30px_rgba(0,0,0,0.28)]"
                      >
                        {task.number}
                      </span>
                      <div data-workflow-accent className="h-14 w-14 shrink-0">
                        <StepIcon index={index} />
                      </div>
                    </div>

                    <div className="flex flex-col justify-center p-6 md:p-8">
                      <p data-workflow-accent className="font-technical text-[10px] uppercase tracking-[0.18em]">
                        Step {task.number}
                      </p>
                      <h2 className="font-display mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#e4edf5]">
                        {task.title}
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-[#91a2b5]">{task.summary}</p>
                    </div>

                    <div className="flex flex-col justify-center border-t border-[#24323b] p-6 md:border-l md:border-t-0 md:p-7">
                      <p className="font-interface text-sm font-semibold uppercase leading-5 tracking-[-0.01em] text-[#e4edf5]">
                        {task.ctaTitle}
                      </p>
                      <p className="mt-2 max-w-sm text-xs leading-5 text-[#8193a6]">{task.ctaSummary}</p>
                      <span
                        data-workflow-accent-box
                        className="font-interface mt-4 inline-flex w-fit items-center gap-3 rounded-xl border px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition group-hover:border-current"
                      >
                        {task.ctaLabel} <ArrowIcon />
                        <span className="sr-only">Open {task.title}</span>
                      </span>
                    </div>
                  </Link>

                  {index < agentechLibraryTasks.length - 1 ? (
                    <div data-flow-connector className="relative flex h-16 items-center justify-center" aria-hidden="true">
                      <span data-workflow-accent-background className="absolute top-0 h-10 w-px" />
                      <span
                        data-workflow-arrow
                        className="absolute bottom-3 h-4 w-4 rotate-45 border-b-2 border-r-2"
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-14 overflow-hidden rounded-xl border border-[#174766] bg-[#02070b]" aria-labelledby="safety-title">
          <div className="border-b border-[#284354] bg-[#061722] px-6 py-7 sm:px-8">
            <p id="safety-title" className="font-interface text-sm font-medium uppercase tracking-[0.22em] text-[#80d8f4]">Safety envelope</p>
          </div>
          <div className="grid md:grid-cols-4">
            {footerStats.map(([title, body], index) => (
              <div
                key={title}
                data-workflow-step={`stat-${index + 1}`}
                className="border-b border-[#24323b] p-6 last:border-b-0 md:min-h-40 md:border-b-0 md:border-r md:last:border-r-0"
                style={{
                  "--workflow-accent-dark": workflowAccentPalette[index].dark,
                  "--workflow-accent-light": workflowAccentPalette[index].light
                } as CSSProperties}
              >
                <p data-workflow-accent className="font-technical text-sm font-medium">{title}</p>
                <p className="mt-4 text-sm leading-6 text-[#8293a7]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 border-t border-[#173245] pt-6 text-[10px] uppercase tracking-[0.17em] text-[#5f7185] sm:flex-row sm:items-center sm:justify-between">
          <p className="font-technical">{aegisFunctions.length} Aegis reference cards · Navi and Master SDK included</p>
          <p>EAIC / Agentech developer systems</p>
        </div>
      </div>
    </div>
  );
}
