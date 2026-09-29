import Link from "next/link";

export function ServiceProfileLinks() {
  const preview = process.env.NODE_ENV === "development" ? "&preview=1" : "";
  return <section aria-label="Client profiles" className="my-6 grid gap-3 sm:grid-cols-2">
    <Link href={`/account/service-profiles?type=data-buyer${preview}`} className="rounded-xl border border-slate-300 bg-white p-5 text-slate-950"><strong className="text-sm">Data Collection Buyer <span aria-hidden="true">↗</span></strong><p className="mt-2 text-xs text-slate-600">Plan datasets and manage collection briefs.</p></Link>
    <Link href={`/account/service-profiles?type=development-client${preview}`} className="rounded-xl border border-slate-300 bg-white p-5 text-slate-950"><strong className="text-sm">App / Website Client <span aria-hidden="true">↗</span></strong><p className="mt-2 text-xs text-slate-600">A simple profile for your development projects.</p></Link>
  </section>;
}
