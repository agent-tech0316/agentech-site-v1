import { NextRequest, NextResponse } from "next/server";
import {
  createSignedAccountSession,
  getServerAccountIdentity,
  setSignedAccountSessionCookie,
  verifySignedAccountSession
} from "@/lib/server-account-session";

export const dynamic = "force-dynamic";

const handoffLifetimeSeconds = 120;
const livePath = "/agentech-products/eaic-hub/watch-live-run";

function siteOrigin(request: NextRequest) {
  const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  return new URL(configured || request.nextUrl.origin).origin;
}

// Exchange the CLI's Supabase bearer token for a very short-lived browser handoff.
export async function POST(request: NextRequest) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) {
    return NextResponse.json({ error: "Sign in to the EAIC CLI before watching." }, { status: 401 });
  }

  const handoff = createSignedAccountSession(identity, handoffLifetimeSeconds);
  const launchUrl = new URL("/api/cli-live-handoff", siteOrigin(request));
  launchUrl.searchParams.set("handoff", handoff);
  return NextResponse.json({ launchUrl: launchUrl.toString(), expiresIn: handoffLifetimeSeconds });
}

// The browser consumes the handoff and immediately redirects, removing it from the address bar.
export async function GET(request: NextRequest) {
  const identity = verifySignedAccountSession(request.nextUrl.searchParams.get("handoff"));
  if (!identity) {
    return NextResponse.redirect(new URL(`${livePath}?cliHandoff=expired`, siteOrigin(request)));
  }

  const response = NextResponse.redirect(new URL(livePath, siteOrigin(request)));
  setSignedAccountSessionCookie(response, identity);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
