"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { getAccountSession } from "@/lib/account-session";
import { isLocalHostname } from "@/lib/local-auth-bypass";
import { eaicHubPath } from "@/features/eaic/01-clients/eaic-hub/contracts/eaic-hub";
import { EaicTaskCard } from "./eaic-task-card";

type AccessStatus = "checking" | "allowed" | "signed-out" | "locked" | "error";

type AccountSummary = {
  accessProfiles?: Array<{
    profile_type?: string | null;
  }>;
  error?: string;
};

const gateAction = "inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";
const primaryGateAction = `${gateAction} bg-[var(--color-title)] text-[color:var(--color-canvas)]`;

function LibraryGateShell({
  children,
  eyebrow,
  title
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div data-eaic-access-gate className="agentech-library-page eaic-task-theme min-h-screen bg-[#f5f4f1] px-5 py-8 text-[#111111] sm:px-8 lg:py-10">
      <section aria-labelledby="eaic-access-title" className="mx-auto grid min-h-[78vh] w-full max-w-4xl content-center">
        <EaicTaskCard>
          <p className="font-interface text-xs font-semibold uppercase tracking-[0.18em] text-[#1a73e8]">{eyebrow}</p>
          <h1 id="eaic-access-title" className="font-display mt-4 text-4xl font-semibold tracking-tight text-[#111111] sm:text-5xl">{title}</h1>
          <div className="mt-5 break-words text-base leading-7 text-[#5f6368]">{children}</div>
        </EaicTaskCard>
      </section>
    </div>
  );
}

export function AgentechLibraryAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AccessStatus>("checking");
  const [email, setEmail] = useState("");

  const loginHref = useMemo(() => `/login?next=${encodeURIComponent(pathname || eaicHubPath)}`, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      const previewProfileType =
        process.env.NODE_ENV !== "production"
          ? new URLSearchParams(window.location.search).get("previewProfile")
          : null;

      if (previewProfileType === "signed-out") {
        setStatus("signed-out");
        router.replace(loginHref);
        return;
      }

      if (previewProfileType === "developer") {
        setEmail("developer.preview@agentech.local");
        setStatus("allowed");
        return;
      }

      if (process.env.NODE_ENV !== "production" || isLocalHostname(window.location.hostname)) {
        setEmail("developer.preview@agentech.local");
        setStatus("allowed");
        return;
      }

      const session = getAccountSession();
      const accountEmail = session?.email ?? "";

      if (!accountEmail) {
        setStatus("signed-out");
        router.replace(loginHref);
        return;
      }

      setEmail(accountEmail);
      setStatus("checking");

      try {
        const response = await fetch(`/api/account?email=${encodeURIComponent(accountEmail)}`);
        const result = (await response.json()) as AccountSummary;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setStatus("error");
          return;
        }

        const hasDeveloperProfile = result.accessProfiles?.some((profile) => profile.profile_type === "developer") ?? false;
        setStatus(hasDeveloperProfile ? "allowed" : "locked");
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [loginHref, router]);

  if (status === "allowed") {
    return children;
  }

  if (status === "signed-out") {
    return (
      <LibraryGateShell eyebrow="Developer access required" title="Sign in to open EAIC HUB.">
        <p>You need an Agentech account with a developer profile before this workspace opens.</p>
        <Link href={loginHref} className={`mt-6 ${primaryGateAction}`}>
          Sign In
        </Link>
      </LibraryGateShell>
    );
  }

  if (status === "locked") {
    return (
      <LibraryGateShell eyebrow="Developer profile required" title="EAIC HUB is only available to developers.">
        <p>
          {email} is signed in, but this account does not have a developer profile yet. Create or switch to a developer profile to access robot testing tools.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/account" className={primaryGateAction}>
            Create Developer Profile
          </Link>
          <Link href={loginHref} className={`${gateAction} border border-[var(--color-border-strong)] text-[color:var(--color-title)]`}>
            Sign In
          </Link>
        </div>
      </LibraryGateShell>
    );
  }

  if (status === "error") {
    return (
      <LibraryGateShell eyebrow="Access check failed" title="We could not verify developer access.">
        <p>Refresh the page or open your account dashboard to confirm this account has a developer profile.</p>
        <Link href="/account" className={`mt-6 ${primaryGateAction}`}>
          Open Account
        </Link>
      </LibraryGateShell>
    );
  }

  return (
    <LibraryGateShell eyebrow="Checking access" title="Opening EAIC HUB.">
      <p>Verifying that this account has a developer profile.</p>
    </LibraryGateShell>
  );
}
