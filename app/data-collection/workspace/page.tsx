import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signedAccountSessionCookieName, verifySignedAccountSession } from "@/lib/server-account-session";
import { isLocalBuyerPreview } from "@/lib/data-collection";
import { BuyerWorkspace } from "@/components/data-collection/workspace";
import { serviceProfilesEnabled } from "@/lib/service-profiles-server";

export const metadata: Metadata = { title: "Data Buyer Workspace", robots: { index: false, follow: false } };
export default async function BuyerWorkspacePage({ searchParams }: { searchParams: Promise<{ preview?: string; view?: string; scenario?: string }> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const preview = isLocalBuyerPreview(process.env.NODE_ENV, requestHeaders.get("host"), params.preview ?? null);
  const signedEmail = verifySignedAccountSession((await cookies()).get(signedAccountSessionCookieName)?.value);
  if (!preview && !signedEmail && isLocalBuyerPreview(process.env.NODE_ENV, requestHeaders.get("host"), "1")) {
    const query = new URLSearchParams({ preview: "1" });
    if (typeof params.view === "string") query.set("view", params.view);
    if (typeof params.scenario === "string") query.set("scenario", params.scenario);
    redirect(`/data-collection/workspace?${query}`);
  }
  if (!preview && !signedEmail) redirect("/login?next=%2Fdata-collection%2Fworkspace");
  if (!serviceProfilesEnabled()) return <div className="dc-container dc-empty"><h1>Buyer workspace preview</h1><p>The new buyer workspace is being prepared. Explore collection scenarios to start planning your dataset.</p><Link href="/data-collection" className="dc-button dc-primary">Explore data collection</Link></div>;
  return <BuyerWorkspace preview={preview} localMode={process.env.NODE_ENV === "development"} accountEmail={preview ? "Local preview" : signedEmail} initialView={params.view ?? "overview"} initialScenario={params.scenario ?? "manufacturing"} />;
}
