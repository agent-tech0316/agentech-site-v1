import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { signedAccountSessionCookieName, verifySignedAccountSession } from "@/lib/server-account-session";
import { isLocalBuyerPreview, isServiceRequestOrigin, normalizeServiceProfile, normalizeCollectionBrief } from "@/lib/data-collection";
import { loadServiceWorkspace, saveServiceProfile, saveCollectionBrief, serviceProfilesEnabled } from "@/lib/service-profiles-server";

export const runtime = "nodejs";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function identityFor(request: NextRequest) {
  if (isLocalBuyerPreview(process.env.NODE_ENV, request.headers.get("host"), request.nextUrl.searchParams.get("preview"))) return "local-buyer-preview";
  // Use the same signed login session. Never trust an email supplied by the browser.
  return verifySignedAccountSession(request.cookies.get(signedAccountSessionCookieName)?.value);
}
export async function GET(request: NextRequest) {
  if (!serviceProfilesEnabled()) return json({ error: "The client workspace is currently available in local preview." }, 503);
  try {
    const identity = identityFor(request);
    if (!identity) return json({ error: "Sign in with your Agentech account to continue." }, 401);
    return json({ ok: true, data: await loadServiceWorkspace(identity) });
  } catch { return json({ error: "We could not load your workspace. Please try again." }, 500); }
}
export async function POST(request: NextRequest) {
  if (!serviceProfilesEnabled()) return json({ error: "The client workspace is currently available in local preview." }, 503);
  const origin = request.headers.get("origin");
  if (!isServiceRequestOrigin(origin, request.headers.get("host"), request.nextUrl.protocol)) return json({ error: "This request could not be verified." }, 403);
  try {
    const identity = identityFor(request);
    if (!identity) return json({ error: "Sign in with your Agentech account to continue." }, 401);
    const raw = await request.text();
    if (raw.length > 16000) return json({ error: "The request is too large." }, 413);
    let payload;
    try { payload = JSON.parse(raw); } catch { return json({ error: "Enter a valid profile or brief." }, 400); }
    if (!payload || typeof payload !== "object") return json({ error: "Enter a valid profile or brief." }, 400);
    if (payload.action === "profile") {
      let profile;
      try { profile = normalizeServiceProfile(payload.profile); } catch (error) { return json({ error: (error as Error).message }, 400); }
      const data = await saveServiceProfile(identity, profile);
      return json({ ok: true, data });
    }
    if (payload.action === "brief") {
      let brief;
      try { brief = normalizeCollectionBrief(payload.brief); } catch (error) { return json({ error: (error as Error).message }, 400); }
      const current = await loadServiceWorkspace(identity);
      if (!current.profile) return json({ error: "Create your buyer profile before saving a project." }, 409);
      if (current.briefs.length >= 100) return json({ error: "Your workspace supports up to 100 project briefs." }, 409);
      const data = await saveCollectionBrief(identity, { ...brief, id: randomUUID(), status: "Draft", createdAt: new Date().toISOString() });
      return json({ ok: true, data }, 201);
    }
    return json({ error: "Choose a profile or project action." }, 400);
  } catch { return json({ error: "Your changes could not be saved. Please try again." }, 500); }
}
