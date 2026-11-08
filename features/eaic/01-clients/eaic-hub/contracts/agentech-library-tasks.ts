import { workflowAccentPalette } from "@/lib/eaic-workflow-palette";

export const scheduleTimeTask = {
  slug: "schedule-time",
  number: "04",
  title: "Schedule Time",
  summary: "Choose the run type, available start time, and viewing duration for the supervised session.",
  ctaTitle: "CHOOSE A TIME SLOT",
  ctaSummary: "See available times and reserve a session for your robot.",
  ctaLabel: "SCHEDULE TIME",
  workflowAccent: workflowAccentPalette[4],
} as const;

export const agentechLibraryTasks = [
  {
    slug: "start-coding",
    workflowAccent: workflowAccentPalette[0],
    number: "01",
    title: "Start Coding",
    summary: "Install package, import Agentech, and copy example code.",
    ctaTitle: "BUILD YOUR FIRST ROBOT COMMAND",
    ctaSummary: "Set up the SDK and run a ready-made movement example.",
    ctaLabel: "START CODING",
    accent: "#008a6c",
    tint: "#e5fff7"
  },
  {
    slug: "view-sdk",
    workflowAccent: workflowAccentPalette[1],
    number: "02",
    title: "View SDK",
    summary: "Choose Aegis, Navi, or Master, then browse exact functions, parameters, limits, examples, and reference media.",
    ctaTitle: "FIND THE EXACT API YOU NEED",
    ctaSummary: "Compare robot functions, parameters, limits, and motion previews.",
    ctaLabel: "EXPLORE SDK",
    accent: "#145cff",
    tint: "#ecf3ff"
  },
  {
    slug: "software-check",
    workflowAccent: workflowAccentPalette[2],
    number: "03",
    title: "Code Certification",
    summary: "Run hardware safety first, then start software security review after it passes.",
    ctaTitle: "KNOW YOUR CODE IS SAFE",
    ctaSummary: "Check hardware limits first, then run software security review.",
    ctaLabel: "CERTIFY CODE",
    accent: "#c85016",
    tint: "#fff4ec"
  },
  scheduleTimeTask,
  {
    slug: "watch-live-run",
    workflowAccent: workflowAccentPalette[3],
    number: "05",
    title: "Watch Live Run",
    summary: "Watch the supervised robot run after scheduling an approved session.",
    ctaTitle: "SEE THE ROBOT EXECUTE",
    ctaSummary: "Open the live camera during your scheduled session.",
    ctaLabel: "WATCH LIVE",
    accent: "#149448",
    tint: "#edfff3"
  }
] as const;

export type AgentechLibraryTaskSlug = (typeof agentechLibraryTasks)[number]["slug"] | "physical-hardware-check";

export function getAgentechLibraryTask(slug: string) {
  return agentechLibraryTasks.find((task) => task.slug === slug);
}
