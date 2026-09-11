type SupabaseOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: string;
  body?: unknown;
  prefer?: string;
};

function encodeStoragePath(path: string) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const normalizedUrl = url.replace(/\/$/, "").replace(/\/rest\/v1$/, "");

  return {
    url: normalizedUrl,
    serviceRoleKey
  };
}

export async function uploadSupabaseStorageObject(
  bucket: string,
  path: string,
  file: File,
  contentType = "application/octet-stream",
  options: { upsert?: boolean; allowExisting?: boolean } = {}
) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": options.upsert ? "true" : "false"
    },
    body: Buffer.from(await file.arrayBuffer()),
    cache: "no-store"
  });

  if (!response.ok) {
    const error = await response.text();
    if (options.allowExisting
      && (response.status === 409 || (response.status === 400 && /duplicate|already exists/i.test(error)))) {
      return { bucket, path };
    }
    throw new Error(error || `Supabase storage upload failed for ${bucket}/${path}.`);
  }

  return {
    bucket,
    path
  };
}

export async function createSignedSupabaseStorageUrl(bucket: string, path: string, expiresIn = 60 * 60) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ expiresIn }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Supabase storage signing failed for ${bucket}/${path}.`);
  const result = await response.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = result.signedURL || result.signedUrl;
  if (!signedPath) throw new Error(`Supabase storage signing returned no URL for ${bucket}/${path}.`);
  if (signedPath.startsWith("http")) return signedPath;
  return signedPath.startsWith("/storage/v1/")
    ? `${url}${signedPath}`
    : `${url}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
}

export async function deleteSupabaseStorageObject(bucket: string, path: string) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    },
    cache: "no-store"
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase storage deletion failed for ${bucket}/${path}.`);
  }
}

export async function supabaseRequest<T>(table: string, options: SupabaseOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const query = options.query ? `?${options.query}` : "";
  const response = await fetch(`${url}/rest/v1/${table}${query}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "return=representation"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Supabase request failed for ${table}.`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();

  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}
