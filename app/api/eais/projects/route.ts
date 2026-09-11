import { NextResponse } from "next/server";
import {
  applyEaisProjectMutation,
  attachEaisProjectCoverUrl,
  deleteEaisProjectCover,
  EaisProjectValidationError,
  listEaisProjects,
  uploadEaisProjectCover
} from "@/lib/eais-projects";
import { getServerAccountIdentity } from "@/lib/server-account-session";

function parseObject(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new EaisProjectValidationError(`${label} must be a JSON object.`);
  }
}
export async function GET(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to open My Works." }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, projects: await listEaisProjects(identity) });
  } catch {
    return NextResponse.json({ error: "Your projects are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to save a project." }, { status: 401 });

  let uploadedCoverPath: string | null = null;
  let mutationCommitted = false;
  let mutationAttempted = false;
  try {
    const form = await request.formData();
    const projectId = String(form.get("projectId") ?? "");
    const mutationId = String(form.get("mutationId") ?? "");
    const file = form.get("cover");
    if (!(file instanceof File)) throw new EaisProjectValidationError("Choose a project cover image.");

    uploadedCoverPath = await uploadEaisProjectCover(identity, projectId, mutationId, file);
    mutationAttempted = true;
    const result = await applyEaisProjectMutation(identity, {
      projectId,
      mutationId,
      action: "create",
      expectedRevision: 0,
      title: String(form.get("title") ?? ""),
      category: String(form.get("category") ?? ""),
      description: String(form.get("description") ?? ""),
      coverObjectPath: uploadedCoverPath,
      draft: parseObject(form.get("draft"), "Draft"),
      progress: parseObject(form.get("progress"), "Progress")
    });

    if (result.kind === "conflict") {
      await deleteEaisProjectCover(identity, uploadedCoverPath).catch(() => null);
      uploadedCoverPath = null;
      return NextResponse.json({ error: "This project ID is already in use." }, { status: 409 });
    }
    if (result.kind !== "applied" || !result.project) {
      await deleteEaisProjectCover(identity, uploadedCoverPath).catch(() => null);
      uploadedCoverPath = null;
      return NextResponse.json({ error: "The project could not be saved." }, { status: 503 });
    }
    mutationCommitted = true;
    const project = await attachEaisProjectCoverUrl(result.project);
    return NextResponse.json({ ok: true, project, replayed: result.replayed }, { status: 201 });
  } catch (error) {
    if (uploadedCoverPath && !mutationCommitted
      && (!mutationAttempted || error instanceof EaisProjectValidationError)) {
      await deleteEaisProjectCover(identity, uploadedCoverPath).catch(() => null);
    }
    if (error instanceof EaisProjectValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "The project could not be saved. Please try again." }, { status: 503 });
  }
}
