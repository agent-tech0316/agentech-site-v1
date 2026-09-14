import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { getAccountRecord } from "@/lib/account-records";
import { getActiveRobotViewingSession } from "@/lib/agentech-live-session";
import { isAgentechCompanyEmail } from "@/lib/company-accounts";
import { isValidAccountIdentifier } from "@/lib/prototype-auth";
import { getServerAccountEmail } from "@/lib/server-account-session";

export const dynamic = "force-dynamic";

const defaultRoomName = process.env.LIVEKIT_ROOM_NAME || "aegis-lab-1";

export async function GET(request: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "LiveKit is not configured." }, { status: 500 });
  }

  const email = await getServerAccountEmail(request, { allowLegacyCookie: true });
  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "Sign in before viewing the live robot session." }, { status: 401 });
  }

  const account = await getAccountRecord(email);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (!isAgentechCompanyEmail(email) && Number(account.credit_balance ?? 0) <= 0) {
    return NextResponse.json({ error: "Live robot viewing requires account credits." }, { status: 402 });
  }

  const activeSession = await getActiveRobotViewingSession(email);
  if (!activeSession) {
    return NextResponse.json(
      { error: "Schedule a robot viewing time before opening the live camera." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("room") || defaultRoomName;
  const viewerId = `website-viewer-${email.replace(/[^a-z0-9_-]/gi, "-")}-${crypto.randomUUID()}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity: viewerId,
    name: email,
    ttl: "30m"
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: false,
    canPublishData: false
  });

  return NextResponse.json({
    token: await token.toJwt(),
    roomName,
    sessionId: activeSession.id,
    robotModel: activeSession.robotModel
  });
}
