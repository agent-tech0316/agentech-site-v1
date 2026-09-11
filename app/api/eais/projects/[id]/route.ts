import { NextResponse } from "next/server";
import {
  applyEaisProjectMutation,
  attachEaisProjectCoverUrl,
  deleteEaisProjectCover,
  EaisProjectValidationError,
  getEaisProject
} from "@/lib/eais-projects";
import { getServerAccountIdentity } from "@/lib/server-account-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to open this project." }, { status: 401 });

  try {
    const project = await getEaisProject(identity, (await params).id);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ ok: true, project });
  } catch {
    return NextResponse.json({ error: "This project is temporarily unavailable." }, { status: 503 });
  }
}
export async function PATCH(request: Request, { params }: RouteContext) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to update this project." }, { status: 401 });
  const payload = await request.json().catch(() => null) as {
    mutationId?: string;
    expectedRevision?: number;
    title?: string;
    category?: string;
    description?: string;
    draft?: unknown;
    progress?: unknown;
  } | null;

  try {
    const result = await applyEaisProjectMutation(identity, {
      projectId: (await params).id,
      mutationId: payload?.mutationId ?? "",
      action: "update",
      expectedRevision: payload?.expectedRevision ?? -1,
      title: payload?.title,
      category: payload?.category,
      description: payload?.description,
      draft: payload?.draft as Record<string, unknown> | undefined,
      progress: payload?.progress as Record<string, unknown> | undefined
    });
    if (result.kind === "not_found") return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (result.kind === "conflict") {
      const project = result.project ? await attachEaisProjectCoverUrl(result.project) : null;
      return NextResponse.json({ error: "This project changed in another session.", project }, { status: 409 });
    }
    if (result.kind !== "applied" || !result.project) {
      return NextResponse.json({ error: "The project could not be updated." }, { status: 503 });
    }
    const project = await attachEaisProjectCoverUrl(result.project);
    return NextResponse.json({ ok: true, project, replayed: result.replayed });
  } catch (error) {
    if (error instanceof EaisProjectValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "The project could not be updated. Please try again." }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to remove this project." }, { status: 401 });
  const payload = await request.json().catch(() => null) as {
    mutationId?: string;
    expectedRevision?: number;
  } | null;

  try {
    const projectId = (await params).id;
    const result = await applyEaisProjectMutation(identity, {
      projectId,
      mutationId: payload?.mutationId ?? "",
      action: "delete",
      expectedRevision: payload?.expectedRevision ?? -1
    });
    if (result.kind === "conflict") {
      const project = result.project ? await attachEaisProjectCoverUrl(result.project) : null;
      return NextResponse.json({ error: "This project changed in another session.", project }, { status: 409 });
    }
    if (result.kind === "not_found") return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (result.kind !== "deleted") return NextResponse.json({ error: "The project could not be removed." }, { status: 503 });
    await deleteEaisProjectCover(identity, result.project?.cover_object_path).catch(() => null);
    return NextResponse.json({ ok: true, replayed: result.replayed });
  } catch (error) {
    if (error instanceof EaisProjectValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "The project could not be removed. Please try again." }, { status: 503 });
  }
}
