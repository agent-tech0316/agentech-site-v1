import type { AccountIdentity } from "@/lib/account-identity";
import { isStableUserId } from "@/lib/account-identity";
import { validateWorkCover, validateWorkDetails, type WorkCategory } from "@/lib/my-works";
import {
  createSignedSupabaseStorageUrl,
  deleteSupabaseStorageObject,
  supabaseRequest,
  uploadSupabaseStorageObject
} from "@/lib/supabase-server";

export const eaisProjectCoverBucket = "eais-project-covers";
const maxStateBytes = 64 * 1024;

export type EaisProjectRecord = {
  id: string;
  owner_user_id: string;
  title: string;
  category: WorkCategory;
  description: string;
  cover_object_path: string | null;
  coverUrl?: string | null;
  draft: Record<string, unknown>;
  progress: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EaisProjectMutation = {
  projectId: string;
  mutationId: string;
  action: "create" | "update" | "delete";
  expectedRevision: number;
  title?: string;
  category?: string;
  description?: string;
  coverObjectPath?: string | null;
  draft?: Record<string, unknown>;
  progress?: Record<string, unknown>;
};

export type EaisProjectMutationResult = {
  kind: "applied" | "deleted" | "conflict" | "not_found" | "invalid_action";
  revision?: number;
  replayed?: boolean;
  project?: EaisProjectRecord | null;
};

export type EaisProjectEditRecord = {
  id: number;
  project_id: string;
  owner_user_id: string;
  mutation_id: string;
  action: "create" | "update" | "delete";
  base_revision: number;
  result_revision: number;
  patch: Record<string, unknown>;
  created_at: string;
};

export class EaisProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EaisProjectValidationError";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateState(value: unknown, label: string) {
  if (!isJsonObject(value)) throw new EaisProjectValidationError(`${label} must be a JSON object.`);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxStateBytes) {
    throw new EaisProjectValidationError(`${label} must be 64 KB or smaller.`);
  }
  return value;
}

export function validateEaisProjectMutation(input: EaisProjectMutation) {
  if (!isUuid(input.projectId) || !isUuid(input.mutationId)) {
    throw new EaisProjectValidationError("Project and mutation IDs must be valid UUIDs.");
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new EaisProjectValidationError("Expected revision must be a nonnegative integer.");
  }

  if (input.action === "create") {
    const details = validateWorkDetails({
      title: input.title ?? "",
      category: input.category ?? "",
      description: input.description ?? ""
    });
    if (!details.ok) throw new EaisProjectValidationError(details.error);
    return {
      ...input,
      ...details.details,
      draft: input.draft === undefined ? {} : validateState(input.draft, "Draft"),
      progress: input.progress === undefined ? {} : validateState(input.progress, "Progress")
    };
  }

  if (input.action === "delete") return input;

  if (input.title !== undefined || input.category !== undefined || input.description !== undefined) {
    if (input.title === undefined || input.category === undefined || input.description === undefined) {
      throw new EaisProjectValidationError("Title, category, and description must be updated together.");
    }
    const details = validateWorkDetails({
      title: input.title,
      category: input.category,
      description: input.description
    });
    if (!details.ok) throw new EaisProjectValidationError(details.error);
    input = { ...input, ...details.details };
  }

  if (input.draft !== undefined) input = { ...input, draft: validateState(input.draft, "Draft") };
  if (input.progress !== undefined) input = { ...input, progress: validateState(input.progress, "Progress") };
  if (input.title === undefined && input.draft === undefined && input.progress === undefined && input.coverObjectPath === undefined) {
    throw new EaisProjectValidationError("Provide at least one project field to update.");
  }
  return input;
}

function assertIdentity(identity: AccountIdentity) {
  if (!isStableUserId(identity.userId)) throw new Error("A stable owner identity is required.");
}

export async function attachEaisProjectCoverUrl(project: EaisProjectRecord) {
  if (!project.cover_object_path) return { ...project, coverUrl: null };
  const coverUrl = await createSignedSupabaseStorageUrl(eaisProjectCoverBucket, project.cover_object_path);
  return { ...project, coverUrl };
}

export async function listEaisProjects(identity: AccountIdentity) {
  assertIdentity(identity);
  const rows = await supabaseRequest<EaisProjectRecord[]>("agentech_projects", {
    query: `owner_user_id=eq.${encodeURIComponent(identity.userId)}&deleted_at=is.null&select=*&order=updated_at.desc`
  });
  return Promise.all(rows.map(attachEaisProjectCoverUrl));
}

export async function getEaisProject(identity: AccountIdentity, projectId: string) {
  assertIdentity(identity);
  if (!isUuid(projectId)) return null;
  const rows = await supabaseRequest<EaisProjectRecord[]>("agentech_projects", {
    query: `id=eq.${encodeURIComponent(projectId)}&owner_user_id=eq.${encodeURIComponent(identity.userId)}&deleted_at=is.null&select=*&limit=1`
  });
  return rows[0] ? attachEaisProjectCoverUrl(rows[0]) : null;
}

export async function listEaisProjectEdits(identity: AccountIdentity, projectId: string, requestedLimit = 50) {
  assertIdentity(identity);
  if (!isUuid(projectId)) return [];
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 50;
  return supabaseRequest<EaisProjectEditRecord[]>("agentech_project_edits", {
    query: `project_id=eq.${encodeURIComponent(projectId)}&owner_user_id=eq.${encodeURIComponent(identity.userId)}&select=id,project_id,owner_user_id,mutation_id,action,base_revision,result_revision,patch,created_at&order=created_at.desc&limit=${limit}`
  });
}

export async function applyEaisProjectMutation(identity: AccountIdentity, input: EaisProjectMutation) {
  assertIdentity(identity);
  const mutation = validateEaisProjectMutation(input);
  const result = await supabaseRequest<EaisProjectMutationResult>("rpc/agentech_apply_project_mutation", {
    method: "POST",
    body: {
      p_project_id: mutation.projectId,
      p_owner_user_id: identity.userId,
      p_mutation_id: mutation.mutationId,
      p_action: mutation.action,
      p_expected_revision: mutation.expectedRevision,
      p_title: mutation.title ?? null,
      p_category: mutation.category ?? null,
      p_description: mutation.description ?? null,
      p_cover_object_path: mutation.coverObjectPath ?? null,
      p_draft: mutation.draft ?? null,
      p_progress: mutation.progress ?? null
    }
  });
  if (!result || !["applied", "deleted", "conflict", "not_found", "invalid_action"].includes(result.kind)) {
    throw new Error("EAIS project mutation returned an invalid result.");
  }
  return result;
}

export async function uploadEaisProjectCover(
  identity: AccountIdentity,
  projectId: string,
  mutationId: string,
  file: File
) {
  assertIdentity(identity);
  if (!isUuid(projectId) || !isUuid(mutationId)) {
    throw new EaisProjectValidationError("Project and mutation IDs must be valid UUIDs.");
  }
  const coverError = validateWorkCover(file);
  if (coverError) throw new EaisProjectValidationError(coverError);
  const extension = ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  } as Record<string, string>)[file.type];
  if (!extension) throw new EaisProjectValidationError("Choose a supported project cover image.");
  const path = `${identity.userId}/${projectId}/${mutationId}/cover.${extension}`;
  await uploadSupabaseStorageObject(eaisProjectCoverBucket, path, file, file.type, {
    upsert: false,
    allowExisting: true
  });
  return path;
}

export async function deleteEaisProjectCover(identity: AccountIdentity, path: string | null | undefined) {
  if (!path) return;
  const expectedPrefix = `${identity.userId}/`;
  if (!path.startsWith(expectedPrefix)) throw new Error("Project cover ownership mismatch.");
  await deleteSupabaseStorageObject(eaisProjectCoverBucket, path);
}
