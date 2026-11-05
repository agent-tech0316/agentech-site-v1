import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { UniversalAuthForm } from "@/components/universal-auth-form";
import { resolveLoginBypassDestination } from "@/lib/local-auth-bypass";
import { reviewReauthReturn } from "@/lib/eaic-review-reauth";
import { getServerAccountEmail } from "@/lib/server-account-session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; reauth?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const params = await searchParams;
  const reviewReturn = reviewReauthReturn(typeof params.reauth === "string" ? params.reauth : null,
    typeof params.next === "string" ? params.next : null);
  if (reviewReturn && await getServerAccountEmail(undefined, { requireSignedSession: true })) {
    redirect(reviewReturn);
  }
  const bypassDestination = resolveLoginBypassDestination(
    requestHeaders,
    params.next,
    process.env.NEXT_PUBLIC_HIDE_SIGN_IN === "1",
  );

  if (bypassDestination && (!reviewReturn || process.env.NEXT_PUBLIC_HIDE_SIGN_IN === "1")) {
    redirect(bypassDestination);
  }

  return (
    <main data-login-theme-page data-login-canvas="warm-off-white" className="min-h-screen bg-[#f5f4f1] px-6 py-10 text-[#0b1220] lg:px-8">
      <section className="mx-auto grid min-h-[82vh] max-w-7xl items-center gap-10 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="min-w-0">
          <Link href="/" className="inline-flex">
            <Image
              data-login-wordmark
              src="/assets/logo/AGENTECH.png"
              alt="Agentech"
              width={1000}
              height={247}
              className="h-auto w-80 max-w-full"
              priority
            />
          </Link>
          <h1
            data-login-hero-title="true"
            className="mt-12 max-w-3xl text-[clamp(3.6rem,5.4vw,5.4rem)] font-black leading-[0.86] tracking-[-0.065em] text-[#0b0b0c]"
          >
            <span className="block">Access the</span>
            <span className="block">Agentech Ecosystem</span>
          </h1>
          <p data-login-hero-copy className="mt-6 max-w-lg text-base leading-7 text-[#334155]">
            Sign in to manage profiles, credits, education programs, invoices, and supervised robot live viewing from one secure workspace.
          </p>
        </div>

        <Suspense fallback={<div data-login-card className="rounded-[28px] bg-white p-7 text-[#0b1220]">Loading...</div>}>
          <UniversalAuthForm />
        </Suspense>
      </section>
    </main>
  );
}
