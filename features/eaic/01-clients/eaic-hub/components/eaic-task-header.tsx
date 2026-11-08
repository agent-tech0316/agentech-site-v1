import Link from "next/link";
import { HistoryBackButton } from "@/components/history-back-button";
import { agentechLibraryTasks } from "../contracts/agentech-library-tasks";
import { eaicHubPath, getEaicHubTaskPath } from "../contracts/eaic-hub";

type EaicTaskHeaderProps = {
  task: (typeof agentechLibraryTasks)[number];
  description?: string;
  fallbackHref?: string;
};

export function EaicTaskHeader({
  task, description = task.summary, fallbackHref = eaicHubPath,
}: EaicTaskHeaderProps) {
  return (
    <section data-eaic-task-header className="border-b border-black/8 bg-[#f5f4f1]">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <HistoryBackButton
            fallbackHref={fallbackHref}
            className="rounded-full border border-black/10 bg-white/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#111111] shadow-sm transition hover:border-[#1a73e8]/50 hover:text-[#1a73e8]"
          />
          <nav aria-label="EAIC tasks" className="flex flex-wrap gap-2">
            {agentechLibraryTasks.map((item) => (
              <Link
                key={item.slug}
                href={getEaicHubTaskPath(item.slug)}
                aria-label={`${item.number} ${item.title}`}
                aria-current={item.slug === task.slug ? "page" : undefined}
                className={`rounded-[10px] border px-3 py-2 font-mono text-xs transition ${
                  item.slug === task.slug
                    ? "border-[#1a73e8]/45 bg-[#1a73e8] text-white shadow-[0_8px_20px_rgba(26,115,232,0.2)]"
                    : "border-black/10 bg-white/65 text-[#5f6368] hover:border-[#1a73e8]/45 hover:text-[#1a73e8]"
                }`}
              >
                {item.number}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
          <div
            data-task-number-badge="true"
            className="grid h-20 w-20 place-items-center rounded-full bg-[#111111] font-mono text-3xl font-medium text-white shadow-[0_14px_34px_rgba(17,17,17,0.14)]"
          >
            {Number.parseInt(task.number, 10)}
          </div>
          <div>
            <p className="font-interface text-xs font-semibold uppercase tracking-[0.18em] text-[#1a73e8]">Command Library Task</p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-[#111111] md:text-5xl">{task.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5f6368]">{description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
