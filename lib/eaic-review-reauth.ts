const reviewPath = "/agentech-products/eaic-hub/software-check";
const draftKey = "agentech-eaic-signin-draft";
const validId = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

type Draft = { code: string; robotModel: string; uploadedFileName: string; uploadedOriginalCode: string };

export function saveReviewDraft(storage: Storage, draft: Draft, submissionId: string) {
  const id = crypto.randomUUID();
  storage.setItem(draftKey, JSON.stringify({ id, draft }));
  const query = new URLSearchParams({ draft: id });
  if (submissionId) query.set("submissionId", submissionId);
  const login = new URLSearchParams({ mode: "signin", reauth: "eaic", next: reviewPath + "?" + query });
  return "/login?" + login;
}

export function reviewReauthReturn(mode: string | null | undefined, next: string | null | undefined) {
  if (mode !== "eaic" || !next?.startsWith(reviewPath + "?")) return null;
  const url = new URL(next, "https://www.agent-tech.ai");
  if (url.pathname !== reviewPath || !validId.test(url.searchParams.get("draft") ?? "")) return null;
  return url.pathname + url.search;
}

export function readReviewDraft(storage: Storage, id: string | null): Draft | null {
  if (!id || !validId.test(id)) return null;
  try {
    const saved = JSON.parse(storage.getItem(draftKey) ?? "null");
    const draft = saved?.draft;
    if (saved?.id !== id || !draft || ![draft.code, draft.robotModel, draft.uploadedFileName,
      draft.uploadedOriginalCode].every(value => typeof value === "string")) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearReviewDraft(storage: Storage, id: string) {
  if (readReviewDraft(storage, id)) storage.removeItem(draftKey);
}
