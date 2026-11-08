import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AgentechLibraryWorkbench } from "@/components/agentech-library-workbench";
import { agentechLibraryTasks, getAgentechLibraryTask, type AgentechLibraryTaskSlug } from "@/lib/agentech-library-tasks";
import { getEaicHubTaskPath } from "@/lib/eaic-hub";

const legacyTaskRedirects: Record<string, AgentechLibraryTaskSlug> = {
  "browse-functions": "view-sdk",
  "try-code": "view-sdk",
  "safety-limits": "view-sdk",
  examples: "view-sdk",
  submit: "software-check",
  "submit-review": "software-check",
  "physical-hardware-check": "software-check",
  "request-robot-slot": "schedule-time"
};

type PageProps = {
  params: Promise<{
    task: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export function generateStaticParams() {
  // Scheduling has a dedicated page that preserves the selected motion package.
  return agentechLibraryTasks.filter((task) => task.slug !== "schedule-time").map((task) => ({ task: task.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { task: taskSlug } = await params;
  const task = getAgentechLibraryTask(taskSlug);

  if (!task) {
    return {
      title: "EAIC HUB | Agentech Products"
    };
  }

  return {
    title: `${task.title} | EAIC HUB`,
    description: task.summary,
    robots: {
      index: false,
      follow: false
    }
  };
}

export default async function EaicHubTaskPage({ params, searchParams }: PageProps) {
  const { task: taskSlug } = await params;
  const redirectSlug = legacyTaskRedirects[taskSlug];

  if (redirectSlug) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(await searchParams)) {
      if (typeof value === "string") query.set(name, value);
      else for (const item of value ?? []) query.append(name, item);
    }
    const path = getEaicHubTaskPath(redirectSlug);
    redirect(query.size ? `${path}?${query}` : path);
  }

  const task = getAgentechLibraryTask(taskSlug);

  if (!task) {
    notFound();
  }

  const requested = taskSlug === "software-check" ? (await searchParams).submissionId : undefined;
  const submissionId = (Array.isArray(requested) ? requested[0] : requested)?.trim() ?? "";
  return <AgentechLibraryWorkbench key={submissionId} task={task.slug as AgentechLibraryTaskSlug} submissionId={submissionId} />;
}
