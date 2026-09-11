const defaultAuthReturnPath = "/account";

function safeFallback(fallback: string) {
  if (fallback === "") return "";
  if (fallback.startsWith("/") && !fallback.startsWith("//") && !fallback.includes("\\")) {
    return fallback;
  }
  return defaultAuthReturnPath;
}

export function resolveAuthReturnPath(value: unknown, fallback = defaultAuthReturnPath) {
  const fallbackPath = safeFallback(fallback);
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate !== "string") return fallbackPath;

  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return fallbackPath;
  }

  try {
    const base = new URL("https://agentech.invalid");
    const target = new URL(trimmed, base);
    if (target.origin !== base.origin) return fallbackPath;

    const destination = `${target.pathname}${target.search}${target.hash}`;
    if (target.pathname === "/login") {
      return fallbackPath;
    }
    return destination;
  } catch {
    return fallbackPath;
  }
}

export function buildLoginPath(value: unknown, fallback = defaultAuthReturnPath) {
  const destination = resolveAuthReturnPath(value, fallback);
  return `/login?next=${encodeURIComponent(destination)}`;
}

export function isProtectedAuthDestination(value: unknown) {
  const destination = resolveAuthReturnPath(value, "");
  return destination === "/admin" ||
    destination.startsWith("/admin/") ||
    destination.startsWith("/agentech-products/eais/projects/");
}
