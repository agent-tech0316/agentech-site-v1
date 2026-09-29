import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isLocalBuyerPreview } from "@/lib/data-collection";
import { signedAccountSessionCookieName, verifySignedAccountSession } from "@/lib/server-account-session";
import { ServiceProfiles } from "@/components/data-collection/service-profiles";
import { serviceProfilesEnabled } from "@/lib/service-profiles-server";
import "../../data-collection/data-collection.css";

export const metadata: Metadata = { title: "Client Profiles", robots: { index: false, follow: false } };
export default async function ClientProfilesPage({ searchParams }: { searchParams: Promise<{ preview?: string; type?: string }> }) {
  const params = await searchParams;
  const type = params.type === "development-client" ? "development-client" : "data-buyer";
  const preview = isLocalBuyerPreview(process.env.NODE_ENV, (await headers()).get("host"), params.preview ?? null);
  const email = verifySignedAccountSession((await cookies()).get(signedAccountSessionCookieName)?.value);
  if (!preview && !email && isLocalBuyerPreview(process.env.NODE_ENV, (await headers()).get("host"), "1")) redirect(`/account/service-profiles?type=${type}&preview=1`);
  if (!preview && !email) redirect(`/login?next=${encodeURIComponent(`/account/service-profiles?type=${type}`)}`);
  return <div data-collection-page>{serviceProfilesEnabled() ? <ServiceProfiles initialType={type} preview={preview} localMode={process.env.NODE_ENV === "development"} accountEmail={preview ? "Local preview" : email} /> : <div className="dc-empty"><h1>Client profiles are coming soon.</h1><p>The new workspace is currently available in local preview.</p></div>}</div>;
}
