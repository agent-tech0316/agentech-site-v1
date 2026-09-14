import { NextRequest, NextResponse } from "next/server";
import { getActiveRobotViewingSession } from "@/lib/agentech-live-session";
import { isValidAccountIdentifier } from "@/lib/prototype-auth";
import { getServerAccountEmail } from "@/lib/server-account-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const email = await getServerAccountEmail(request, { allowLegacyCookie: true });
  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "Sign in to view a robot session." }, { status: 401 });
  }

  const session = await getActiveRobotViewingSession(email);
  if (!session) {
    return NextResponse.json({ active: false, session: null });
  }

  return NextResponse.json({
    active: true,
    session: {
      id: session.id,
      robotModel: session.robotModel,
      status: session.status,
      scheduledStart: session.scheduledStart,
      scheduledEnd: session.scheduledEnd
    }
  });
}
