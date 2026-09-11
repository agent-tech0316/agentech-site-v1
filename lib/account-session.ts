export type AgentechAccountSession = {
  email: string;
  userId?: string;
  signedInAt: string;
};

export const accountSessionKey = "agentechAccount";
export const legacyAccountEmailKey = "agentechAccountEmail";
export const accountSessionEvent = "agentech-account-session-change";
export const accountSessionCookieName = "agentech_account_email";

const accountSessionKeys = [accountSessionKey, legacyAccountEmailKey];

function setAccountCookie(email: string) {
  window.document.cookie = `${accountSessionCookieName}=${encodeURIComponent(email)}; path=/; max-age=2592000; SameSite=Lax`;
}

export function getAccountSession() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(accountSessionKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AgentechAccountSession;
      if (parsed.email) {
        setAccountCookie(parsed.email);
        return parsed;
      }
    } catch {
      window.localStorage.removeItem(accountSessionKey);
    }
  }

  const legacyEmail = window.localStorage.getItem(legacyAccountEmailKey);
  if (legacyEmail) {
    return setAccountSession(legacyEmail);
  }

  return null;
}

export function setAccountSession(email: string, userId?: string) {
  const session: AgentechAccountSession = {
    email,
    ...(userId ? { userId } : {}),
    signedInAt: new Date().toISOString()
  };

  window.localStorage.setItem(accountSessionKey, JSON.stringify(session));
  window.localStorage.setItem(legacyAccountEmailKey, email);
  setAccountCookie(email);
  window.dispatchEvent(new Event(accountSessionEvent));
  return session;
}

export function clearAccountSession() {
  for (const key of accountSessionKeys) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
  window.document.cookie = `${accountSessionCookieName}=; path=/; max-age=0; SameSite=Lax`;
  window.dispatchEvent(new Event(accountSessionEvent));
}

export async function signOutAccountSession() {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST"
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(result?.error || "Unable to sign out.");
  }

  clearAccountSession();
}
