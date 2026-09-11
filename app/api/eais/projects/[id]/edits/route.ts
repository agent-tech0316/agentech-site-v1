import { NextResponse } from "next/server";
import { getEaisProject, listEaisProjectEdits } from "@/lib/eais-projects";
import { getServerAccountIdentity } from "@/lib/server-account-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to view project edits." }, { status: 401 });

  try {
    const projectId = (await params).id;
    const project = await getEaisProject(identity, projectId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    return NextResponse.json({
      ok: true,
      projectId,
      revision: project.revision,
      edits: await listEaisProjectEdits(identity, projectId, limit)
    });
  } catch {
    return NextResponse.json({ error: "Project edits are temporarily unavailable." }, { status: 503 });
  }
}
