"use client";

import { useEffect, useState } from "react";
import type { PublicNaviReference } from "@/features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer";

type PremiumFeatureStatus = {
  feature?: { name: string };
  access?: { allowed: boolean; source: "subscription" | "purchase" | "internal" | "none" };
  priceCents?: number | null;
  error?: string;
};

let premiumStatusRequest: Promise<{ response: Response; payload: PremiumFeatureStatus | null }> | null = null;

function loadPremiumStatus() {
  premiumStatusRequest ??= fetch("/api/premium-features/return-to-home", { cache: "no-store" })
    .then(async (response) => ({ response, payload: await response.json().catch(() => null) as PremiumFeatureStatus | null }));
  return premiumStatusRequest;
}

export function NaviPremiumFeaturePanel({ reference }: { reference: PublicNaviReference }) {
  const [status, setStatus] = useState<PremiumFeatureStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const access = reference.access;

  useEffect(() => {
    if (!access) return;
    let active = true;
    loadPremiumStatus()
      .then(({ response, payload }) => {
        if (!active) return;
        setStatus(payload ?? { error: response.status === 401 ? "Sign in to check access." : "Unable to check access." });
      })
      .catch(() => active && setStatus({ error: "Unable to check access." }));
    return () => { active = false; };
  }, [access]);

  if (!access) return null;

  const purchase = async () => {
    setBusy(true);
    const response = await fetch("/api/premium-features/return-to-home", { method: "POST" });
    const payload = await response.json().catch(() => null) as (PremiumFeatureStatus & { checkoutUrl?: string; alreadyEntitled?: boolean }) | null;
    if (payload?.checkoutUrl) {
      window.location.href = payload.checkoutUrl;
      return;
    }
    if (payload?.alreadyEntitled) {
      window.location.reload();
      return;
    }
    setStatus(payload ?? { error: "Unable to start checkout." });
    setBusy(false);
  };

  const price = typeof status?.priceCents === "number"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(status.priceCents / 100)
    : null;

  return (
    <div data-navi-premium-panel="true" className="border border-[#7c5ce7] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#1a73e8]">Premium function</p>
          <p className="mt-1 text-xs leading-5 text-[#334155]">
            Included with an active monthly subscription. Non-subscribers can purchase a lifetime unlock for this function only.
          </p>
          <p aria-live="polite" className="mt-2 text-xs font-medium text-[#334155]">
            {status?.access?.allowed
              ? status.access.source === "subscription"
                ? "Unlocked by monthly subscription"
                : status.access.source === "purchase"
                  ? "Lifetime feature unlocked"
                  : "Internal access enabled"
              : status?.error || (price ? `One-time unlock: ${price}` : "Checking access…")}
          </p>
        </div>
        {!status?.access?.allowed ? (
          <button
            type="button"
            disabled={busy || status?.priceCents == null}
            onClick={purchase}
            className="min-h-11 border border-[#5b35c8] bg-[#5b35c8] px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Opening checkout…" : price ? `Unlock for ${price}` : "Price coming soon"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
