type SupabaseOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: string;
  body?: unknown;
  prefer?: string;
};

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
  contentType = "application/octet-stream"
) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "false"
    },
    body: Buffer.from(await file.arrayBuffer()),
    cache: "no-store"
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Supabase storage upload failed for ${bucket}/${path}.`);
  }

  return {
    bucket,
    path
  };
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
    signal: AbortSignal.timeout(10_000),
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
