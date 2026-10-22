import type { NaviCategory } from "./navi-sdk-explorer";

export type NaviExplorerState = Readonly<{
  query: string;
  category: NaviCategory | "All";
  openReferenceName: string | null;
}>;

const categoryBySlug: Readonly<Record<string, NaviCategory>> = Object.freeze({
  movement: "Movement",
  athletics: "Athletics",
  actions: "Actions",
  posture: "Posture",
  configuration: "Configuration",
  safety: "Safety",
  sensing: "Sensing",
});

const slugByCategory = new Map<NaviCategory, string>(
  Object.entries(categoryBySlug).map(([slug, category]) => [category, slug]),
);

function comparableTokens(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

export function parseNaviExplorerState(
  searchParams: URLSearchParams,
  canonicalNames: ReadonlySet<string>,
): NaviExplorerState {
  if (searchParams.get("robot") !== "navi") {
    return Object.freeze({ query: "", category: "All", openReferenceName: null });
  }

  let query = (searchParams.get("q") ?? "").trim().slice(0, 120);
  let category: NaviCategory | "All" = categoryBySlug[searchParams.get("category") ?? ""] ?? "All";
  const reference = searchParams.get("ref");
  const openReferenceName = reference && canonicalNames.has(reference) ? reference : null;

  if (openReferenceName && query) {
    const referenceText = comparableTokens(openReferenceName).join(" ");
    const queryCompatible = comparableTokens(query).every((token) => referenceText.includes(token));
    if (!queryCompatible) {
      query = "";
      category = "All";
    }
  }

  return Object.freeze({ query, category, openReferenceName });
}

export function serializeNaviExplorerState(current: URLSearchParams, state: NaviExplorerState): URLSearchParams {
  const next = new URLSearchParams(current);
  if (state.query) next.set("q", state.query.trim().slice(0, 120));
  else next.delete("q");

  if (state.category === "All") next.delete("category");
  else next.set("category", slugByCategory.get(state.category)!);

  if (state.openReferenceName) next.set("ref", state.openReferenceName);
  else next.delete("ref");
  return next;
}

export function stripNaviExplorerParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete("q");
  next.delete("category");
  next.delete("ref");
  return next;
}
