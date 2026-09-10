"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import "./site-footer.css";

export function SiteFooter() {
  const pathname = usePathname();

  if (
    pathname.startsWith("/field-interest") ||
    pathname.startsWith("/agentech-products/agentech-library") ||
    pathname.startsWith("/agentech-products/eaic-hub")
  ) {
    return null;
  }

  return (
    <footer className="border-t border-[#363d45]/70 bg-black">
      <div
        data-site-footer-inner
        className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate sm:gap-5 sm:px-6 sm:py-8 sm:text-sm sm:tracking-[0.22em] lg:flex-row lg:items-center lg:justify-between lg:px-8"
      >
        <p data-site-footer-company>Agentech, Inc.</p>
        <div
          data-site-footer-links
          className="flex gap-6 sm:flex-col sm:gap-5 lg:flex-row lg:items-center lg:gap-8"
        >
          <Link data-site-footer-link href="/about" className="transition hover:text-white">
            About
          </Link>
          <Link data-site-footer-link href="/news" className="transition hover:text-white">
            News
          </Link>
        </div>
      </div>
    </footer>
  );
}
