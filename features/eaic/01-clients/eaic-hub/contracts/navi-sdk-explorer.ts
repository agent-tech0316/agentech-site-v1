import type { AgentechFunction, CapabilityStatus } from "../../../02-unified-api/projects-validation/aegis-sdk-reference";
import type {
  NaviDiscoverability,
  NaviFunction,
  NaviReturnDocumentation,
} from "../../../02-unified-api/projects-validation/navi-sdk-reference";

export type NaviCategory = Extract<
  AgentechFunction["category"],
  "Movement" | "Athletics" | "Actions" | "Posture" | "Configuration" | "Safety" | "Sensing"
>;

export const NAVI_EXPLORER_CATEGORIES: readonly NaviCategory[] = Object.freeze([
  "Movement",
  "Athletics",
  "Actions",
  "Posture",
  "Configuration",
  "Safety",
  "Sensing",
]);

export const NAVI_PUBLIC_PLATFORM_NOTE_NAMES: ReadonlySet<string> = new Set([
  "jump",
  "jump_forward",
  "observe",
  "set_gait",
  "set_foot_height",
  "set_collision_protect",
  "set_friction",
  "set_jump_distance",
  "set_jump_angle",
]);

export type PublicNaviParam = Readonly<{
  name: string;
  type: string;
  defaultValue?: string;
  description: string;
  allowedValues?: readonly string[];
  allowedRange?: string;
  status?: CapabilityStatus;
}>;

export type PublicNaviProfile = Readonly<{
  name: string;
  syntax: string;
  description?: string;
  number?: number;
  note?: string;
  noteLabel?: string;
  status?: CapabilityStatus;
}>;

export type PublicNaviAccess = Readonly<{
  tier: "premium";
  includedWithMonthlySubscription: boolean;
  oneTimePurchase: boolean;
}>;

export type PublicNaviReference = Readonly<{
  name: string;
  category: NaviCategory;
  signature: string;
  summary: string;
  example: string;
  params: readonly PublicNaviParam[];
  profiles: readonly PublicNaviProfile[];
  status?: CapabilityStatus;
  creditUsage?: "high";
  access?: PublicNaviAccess;
  platformNote?: string;
  platformNoteLabel?: string;
  discovery?: NaviDiscoverability;
  returns?: NaviReturnDocumentation;
  sourceIndex: number;
}>;

const reviewedCommonTasks = [
  ["stand", "Get Navi ready in a standing state", ["stand", "standing", "standing state", "ready"]],
  ["forward", "Move forward", ["forward", "move forward", "forward movement"]],
  ["turn", "Turn left or right", ["turn", "turn left", "turn right", "left turn", "right turn"]],
  ["sit", "Sit and return to standing automatically", ["sit", "sitting", "return to stand", "auto return to stand"]],
  ["stop", "Stop walking or turning", ["stop", "stop walking", "stop turning"]],
  ["get_battery_status", "View battery status", ["battery", "battery status", "view battery status"]],
] as const;

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function assertTrimmed(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string" || value !== value.trim() || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} must be trimmed, non-empty, and at most ${maximum} characters.`);
  }
}

function isCalendarDate(value: unknown): value is `${number}-${number}-${number}` {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateReviewedDate(value: unknown, label: string) {
  if (!isCalendarDate(value)) throw new Error(`${label} must be a valid ISO calendar date.`);
}

function validateDiscovery(item: NaviFunction, ranks: Set<number>) {
  if (!item.discovery) return;
  assertTrimmed(item.discovery.taskLabel, `${item.name} taskLabel`, 80);
  if (!Array.isArray(item.discovery.keywords) || item.discovery.keywords.length > 12) {
    throw new Error(`${item.name} keywords must contain at most 12 entries.`);
  }
  const keywordKeys = new Set<string>();
  for (const keyword of item.discovery.keywords) {
    assertTrimmed(keyword, `${item.name} keyword`, 50);
    const key = normalized(keyword);
    if (keywordKeys.has(key)) throw new Error(`${item.name} keywords must be unique after normalization.`);
    keywordKeys.add(key);
  }

  const commonTask = item.discovery.commonTask;
  if (!commonTask) return;
  if (!Number.isInteger(commonTask.rank) || commonTask.rank < 1 || commonTask.rank > 6) {
    throw new Error(`${item.name} Common Task rank must be an integer from 1 through 6.`);
  }
  if (ranks.has(commonTask.rank)) throw new Error(`Duplicate Common Task rank: ${commonTask.rank}.`);
  ranks.add(commonTask.rank);
  if (commonTask.approved !== true) throw new Error(`${item.name} Common Task must be approved.`);
  assertTrimmed(commonTask.reviewedBy, `${item.name} Common Task reviewer`, 120);
  validateReviewedDate(commonTask.reviewedOn, `${item.name} Common Task review date`);
  if (item.status === "development" || item.status === "unsupported") {
    throw new Error(`${item.name} cannot be a Common Task while ${item.status}.`);
  }
}

function validateReturn(item: NaviFunction) {
  if (!item.returns) return;
  assertTrimmed(item.returns.type, `${item.name} return type`, 120);
  if (item.returns.description !== undefined) assertTrimmed(item.returns.description, `${item.name} return description`, 500);
  assertTrimmed(item.returns.reviewedBy, `${item.name} return reviewer`, 120);
  validateReviewedDate(item.returns.reviewedOn, `${item.name} return review date`);
}

function validateCompleteCommonTaskSet(items: readonly NaviFunction[]) {
  const common = items
    .filter((item) => item.discovery?.commonTask)
    .sort((left, right) => left.discovery!.commonTask!.rank - right.discovery!.commonTask!.rank);
  if (common.length === 0 || items.length < reviewedCommonTasks.length) return;
  if (common.length !== reviewedCommonTasks.length) throw new Error("The reviewed Common Task set must contain exactly six records.");
  for (let index = 0; index < reviewedCommonTasks.length; index += 1) {
    const [name, taskLabel, keywords] = reviewedCommonTasks[index];
    const item = common[index];
    const review = item.discovery!.commonTask!;
    if (
      item.name !== name
      || item.discovery!.taskLabel !== taskLabel
      || JSON.stringify(item.discovery!.keywords) !== JSON.stringify(keywords)
      || review.rank !== index + 1
      || review.approved !== true
      || review.reviewedBy !== "Agentech product owner"
      || review.reviewedOn !== "2026-10-14"
    ) {
      throw new Error(`Common Task rank ${index + 1} does not match the approved publication manifest.`);
    }
  }
}

export function validateNaviExplorerSource(items: readonly NaviFunction[]): void {
  const names = new Set<string>();
  const ranks = new Set<number>();
  for (const item of items) {
    if (names.has(item.name)) throw new Error(`Duplicate canonical Navi reference: ${item.name}.`);
    names.add(item.name);
    validateDiscovery(item, ranks);
    validateReturn(item);
  }
  validateCompleteCommonTaskSet(items);
}

function freezeDiscovery(discovery: NaviDiscoverability | undefined) {
  if (!discovery) return undefined;
  const commonTask = discovery.commonTask ? Object.freeze({ ...discovery.commonTask }) : undefined;
  return Object.freeze({ ...discovery, keywords: Object.freeze([...discovery.keywords]), commonTask });
}

export function toPublicNaviReference(item: NaviFunction, sourceIndex: number): PublicNaviReference {
  const params = Object.freeze(item.params
    .filter((param) => param.name !== "**connect_kwargs")
    .map((param) => Object.freeze({
      name: param.name,
      type: param.type,
      ...(param.defaultValue !== undefined ? { defaultValue: param.defaultValue } : {}),
      description: param.description,
      ...(param.allowedValues ? { allowedValues: Object.freeze([...param.allowedValues]) } : {}),
      ...(param.allowedRange !== undefined ? { allowedRange: param.allowedRange } : {}),
      ...(param.status !== undefined ? { status: param.status } : {}),
    })));
  const profiles = Object.freeze((item.profiles ?? []).map((profile) => Object.freeze({
    name: profile.name,
    syntax: profile.syntax,
    ...(profile.description !== undefined ? { description: profile.description } : {}),
    ...(profile.number !== undefined ? { number: profile.number } : {}),
    ...(profile.note !== undefined ? { note: profile.note } : {}),
    ...(profile.noteLabel !== undefined ? { noteLabel: profile.noteLabel } : {}),
    ...(profile.status !== undefined ? { status: profile.status } : {}),
  })));
  const access = item.access ? Object.freeze({
    tier: item.access.tier,
    includedWithMonthlySubscription: item.access.includedWithMonthlySubscription,
    oneTimePurchase: item.access.oneTimePurchase,
  }) : undefined;
  const platformNoteIsPublic = NAVI_PUBLIC_PLATFORM_NOTE_NAMES.has(item.name);

  return Object.freeze({
    name: item.name,
    category: item.category as NaviCategory,
    signature: item.signature,
    summary: item.summary,
    example: item.example,
    params,
    profiles,
    ...(item.status !== undefined ? { status: item.status } : {}),
    ...(item.creditUsage !== undefined ? { creditUsage: item.creditUsage } : {}),
    ...(access ? { access } : {}),
    ...(platformNoteIsPublic && item.platformNote ? { platformNote: item.platformNote } : {}),
    ...(platformNoteIsPublic && item.platformNoteLabel ? { platformNoteLabel: item.platformNoteLabel } : {}),
    ...(item.discovery ? { discovery: freezeDiscovery(item.discovery) } : {}),
    ...(item.returns ? { returns: Object.freeze({ ...item.returns }) } : {}),
    sourceIndex,
  });
}

export function buildPublicNaviReferences(items: readonly NaviFunction[]): readonly PublicNaviReference[] {
  validateNaviExplorerSource(items);
  return Object.freeze(items.map(toPublicNaviReference));
}

export function selectReviewedCommonTasks(items: readonly PublicNaviReference[]): readonly PublicNaviReference[] {
  const selected = items
    .filter((item) => item.discovery?.commonTask)
    .sort((left, right) => left.discovery!.commonTask!.rank - right.discovery!.commonTask!.rank);
  return Object.freeze(selected);
}

export function getNaviReturnPresentation(item: PublicNaviReference): Readonly<{ type: string | null; description: string }> {
  if (!item.returns) return Object.freeze({ type: null, description: "Not documented in the current public reference." });
  return Object.freeze({
    type: item.returns.type,
    description: item.returns.description ?? "Documented return type; no additional public description is recorded.",
  });
}

export type NaviSearchFieldKind =
  | "canonical"
  | "callable"
  | "signature"
  | "task"
  | "summary"
  | "category"
  | "parameter"
  | "profile"
  | "return"
  | "platform-note"
  | "example";

export type NormalizedNaviSearchValue = Readonly<{
  exact: string;
  tokenText: string;
  tokens: readonly string[];
}>;

export type NaviSearchField = Readonly<{
  kind: NaviSearchFieldKind;
  normalized: NormalizedNaviSearchValue;
}>;

export type NaviSearchDocument = Readonly<{
  reference: PublicNaviReference;
  sourceIndex: number;
  canonicalComparable: string;
  callableComparables: readonly string[];
  fields: readonly NaviSearchField[];
}>;

export type NaviSearchResult = Readonly<{
  reference: PublicNaviReference;
  score: number;
}>;

const NAVI_SEARCH_WEIGHTS: Readonly<Record<NaviSearchFieldKind, number>> = Object.freeze({
  canonical: 60,
  callable: 60,
  signature: 50,
  task: 40,
  summary: 30,
  category: 30,
  parameter: 20,
  profile: 20,
  return: 10,
  "platform-note": 10,
  example: 10,
});

export function normalizeNaviSearchValue(value: string): NormalizedNaviSearchValue {
  const exact = value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
  const tokenText = exact.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return Object.freeze({ exact, tokenText, tokens: Object.freeze(tokenText ? tokenText.split(" ") : []) });
}

function naviCallableNames(item: PublicNaviReference) {
  const callables = new Set<string>();
  for (const source of [item.signature, ...item.profiles.map((profile) => profile.syntax)]) {
    for (const match of source.matchAll(/\bAgentech\.([A-Za-z_]\w*)\s*\(/g)) callables.add(match[1]);
  }
  return [...callables];
}

function publicField(kind: NaviSearchFieldKind, values: readonly (string | number | undefined)[]): NaviSearchField | null {
  const value = values.filter((candidate) => candidate !== undefined && String(candidate).length > 0).join(" ");
  if (!value) return null;
  return Object.freeze({ kind, normalized: normalizeNaviSearchValue(value) });
}

export function buildNaviSearchIndex(items: readonly PublicNaviReference[]): readonly NaviSearchDocument[] {
  return Object.freeze(items.map((reference) => {
    const callables = naviCallableNames(reference);
    const fields: (NaviSearchField | null)[] = [
      publicField("canonical", [reference.name]),
      ...callables.map((callable) => publicField("callable", [callable])),
      publicField("signature", [reference.signature]),
      ...(reference.discovery ? [
        publicField("task", [reference.discovery.taskLabel]),
        ...reference.discovery.keywords.map((keyword) => publicField("task", [keyword])),
      ] : []),
      publicField("summary", [reference.summary]),
      publicField("category", [reference.category]),
      ...reference.params.map((param) => publicField("parameter", [
        param.name,
        param.type,
        param.defaultValue,
        param.description,
        ...(param.allowedValues ?? []),
        param.allowedRange,
      ])),
      ...reference.profiles.map((profile) => publicField("profile", [
        profile.name,
        profile.syntax,
        profile.description,
        profile.number,
        profile.note,
        profile.noteLabel,
      ])),
      ...(reference.returns ? [publicField("return", [reference.returns.type, reference.returns.description])] : []),
      ...(reference.platformNote ? [publicField("platform-note", [reference.platformNote, reference.platformNoteLabel])] : []),
      publicField("example", [reference.example]),
    ];
    return Object.freeze({
      reference,
      sourceIndex: reference.sourceIndex,
      canonicalComparable: normalizeNaviSearchValue(reference.name).exact,
      callableComparables: Object.freeze(callables.map((callable) => normalizeNaviSearchValue(callable).exact)),
      fields: Object.freeze(fields.filter((field): field is NaviSearchField => field !== null)),
    });
  }));
}

function scoreNaviDocument(document: NaviSearchDocument, query: NormalizedNaviSearchValue) {
  let score = 0;
  if (document.canonicalComparable === query.exact || document.callableComparables.includes(query.exact)) score += 1_000;
  else if (
    document.canonicalComparable.startsWith(query.exact)
    || document.callableComparables.some((callable) => callable.startsWith(query.exact))
  ) score += 500;

  for (const token of query.tokens) {
    let highestWeight = 0;
    for (const field of document.fields) {
      if (field.normalized.tokenText.includes(token)) highestWeight = Math.max(highestWeight, NAVI_SEARCH_WEIGHTS[field.kind]);
    }
    if (highestWeight === 0) return null;
    score += highestWeight;
  }
  return score;
}

export function searchNaviReferences(
  index: readonly NaviSearchDocument[],
  queryValue: string,
  category: NaviCategory | "All",
): readonly NaviSearchResult[] {
  const query = normalizeNaviSearchValue(queryValue);
  const results: { reference: PublicNaviReference; score: number; sourceIndex: number }[] = [];
  for (const document of index) {
    if (category !== "All" && document.reference.category !== category) continue;
    const score = query.tokens.length === 0 ? 0 : scoreNaviDocument(document, query);
    if (score === null) continue;
    results.push({ reference: document.reference, score, sourceIndex: document.sourceIndex });
  }
  results.sort((left, right) => right.score - left.score || left.sourceIndex - right.sourceIndex);
  return Object.freeze(results.map(({ reference, score }) => Object.freeze({ reference, score })));
}

export function getNaviCategoryCounts(
  index: readonly NaviSearchDocument[],
  query: string,
): Readonly<Record<"All" | NaviCategory, number>> {
  const matches = searchNaviReferences(index, query, "All");
  const counts: Record<"All" | NaviCategory, number> = {
    All: matches.length,
    Movement: 0,
    Athletics: 0,
    Actions: 0,
    Posture: 0,
    Configuration: 0,
    Safety: 0,
    Sensing: 0,
  };
  for (const match of matches) counts[match.reference.category] += 1;
  return Object.freeze(counts);
}
