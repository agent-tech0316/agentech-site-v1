"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { ServiceMenu } from "@/components/service-menu";
import { accountSessionEvent, getAccountSession, signOutAccountSession } from "@/lib/account-session";
import { navigation } from "@/lib/site-data";
import {
  shouldHideSiteHeader,
  shouldShowAuthControls,
  shouldShowMobileThemeToggle,
  shouldShowThemeToggle
} from "@/lib/site-header-visibility";

function NavWordmark({
  active,
  alt,
  mobile = false
}: {
  active: boolean;
  alt: string;
  mobile?: boolean;
}) {
  return (
    <span
      data-site-nav-wordmark
      aria-label={alt}
      className={`agent-nav-wordmark ${active ? "is-active" : ""} ${mobile ? "is-mobile" : ""}`}
    >
      <span aria-hidden="true">{alt.toUpperCase()}</span>
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openCategoryMenu, setOpenCategoryMenu] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [showAuthControls, setShowAuthControls] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    setShowAuthControls(
      shouldShowAuthControls(
        window.location.hostname,
        process.env.NEXT_PUBLIC_HIDE_SIGN_IN === "1"
      )
    );

    function refreshSession() {
      setAccountEmail(getAccountSession()?.email ?? "");
    }

    refreshSession();
    window.addEventListener(accountSessionEvent, refreshSession);
    window.addEventListener("storage", refreshSession);

    return () => {
      window.removeEventListener(accountSessionEvent, refreshSession);
      window.removeEventListener("storage", refreshSession);
    };
  }, []);

  function closeMobileNav() {
    setMobileOpen(false);
    setOpenCategoryMenu(null);
  }

  function changeCategoryMenu(key: string, open: boolean) {
    // An old menu's delayed pointer-leave must not close the newly opened one.
    setOpenCategoryMenu((current) => open ? key : current === key ? null : current);
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutFailed(false);

    try {
      await signOutAccountSession();
      setAccountEmail("");
      closeMobileNav();
      router.replace("/login?signedOut=1");
      router.refresh();
    } catch {
      setSignOutFailed(true);
      setSigningOut(false);
    }
  }

  function getLoginHref() {
    if (pathname.startsWith("/agentech-education")) {
      return "/login?next=/account-setup";
    }

    if (pathname.startsWith("/agentech-robotic") || pathname.startsWith("/preorder")) {
      return "/login?next=/account";
    }

    if (
      pathname.startsWith("/talents") ||
      pathname.startsWith("/ai-robotics-club") ||
      pathname.startsWith("/tech-education") ||
      pathname.startsWith("/summer-school") ||
      pathname.startsWith("/career-intern")
    ) {
      return `/login?next=${encodeURIComponent(pathname)}`;
    }

    return "/login";
  }

  function isActiveNavItem(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const loginHref = getLoginHref();
  const showThemeToggle = shouldShowThemeToggle(pathname);
  const showMobileThemeToggle = shouldShowMobileThemeToggle(pathname);

  if (shouldHideSiteHeader(pathname)) {
    return null;
  }

  return (
    <header
      data-site-header
      className="sticky top-0 z-50 h-[72px] border-b border-[#363d45]/70 bg-black/80 backdrop-blur-xl"
    >
      <div data-site-header-inner className="relative mx-auto flex h-full w-full max-w-none flex-nowrap items-center justify-between gap-4 px-2 sm:px-3 lg:px-4">
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3" onClick={closeMobileNav}>
          <BrandMark />
        </Link>

        <div data-mobile-theme-controls className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
          {showMobileThemeToggle ? <ThemeToggle mobileHeader /> : null}
          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            onClick={() => {
              setMobileOpen((open) => !open);
              setOpenCategoryMenu(null);
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 text-white transition hover:bg-white/10 lg:hidden"
          >
            <span className="flex w-5 flex-col gap-1.5">
              <span className={`h-0.5 rounded-full bg-current transition ${mobileOpen ? "translate-y-2 rotate-45" : ""}`} />
              <span className={`h-0.5 rounded-full bg-current transition ${mobileOpen ? "opacity-0" : ""}`} />
              <span className={`h-0.5 rounded-full bg-current transition ${mobileOpen ? "-translate-y-2 -rotate-45" : ""}`} />
            </span>
          </button>
        </div>

        <nav className={`ml-auto hidden h-full flex-nowrap items-center justify-end gap-1 text-sm text-slate lg:flex ${showAuthControls && accountEmail ? "pr-[152px]" : ""}`}>
          {navigation.map((item) => {
            const linkClassName = "agent-nav-link rounded-xl px-3 py-2";
            const isActive = isActiveNavItem(item.href);

            if (item.columns?.length) {
              return (
                <ServiceMenu
                  key={item.href}
                  name={item.label}
                  columns={item.columns}
                  triggerHref={item.menuTriggerHref}
                  active={isActive}
                  open={openCategoryMenu === `desktop:${item.label}`}
                  onOpenChange={(open) => changeCategoryMenu(`desktop:${item.label}`, open)}
                >
                  <NavWordmark active={isActive} alt={item.label} />
                </ServiceMenu>
              );
            }

            if (item.children?.length) {
              return (
                <div key={item.href} className="group relative flex items-center">
                  <Link
                    href={item.href}
                    className={`${linkClassName} flex items-center gap-2 ${isActive ? "is-active" : ""}`}
                    data-cursor-intent="nav"
                  >
                    <NavWordmark active={isActive} alt={item.label} />
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 12 12"
                      className="h-3 w-3 transition duration-150 group-hover:rotate-180 group-focus-within:rotate-180"
                    >
                      <path
                        d="M2.25 4.5 6 8.25 9.75 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.4"
                      />
                    </svg>
                  </Link>

                  <div className="pointer-events-none absolute left-1/2 top-[calc(100%+1px)] z-[70] w-max -translate-x-1/2 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <div className="min-w-[260px] overflow-hidden rounded-[28px] border border-[#363d45]/70 bg-[#090b0f] p-2 shadow-[0_28px_80px_rgba(0,0,0,0.72)]">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block rounded-xl px-4 py-3 text-sm transition ${
                            pathname === child.href
                              ? "bg-white/8 text-white"
                              : "text-slate hover:bg-white/6 hover:text-white"
                          }`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${linkClassName} ${isActive ? "is-active" : ""}`}
                data-cursor-intent="nav"
              >
                <NavWordmark active={isActive} alt={item.label} />
              </Link>
            );
          })}
          {showThemeToggle ? <ThemeToggle /> : null}
          {showAuthControls && !accountEmail ? (
            <Link href={loginHref} className="ml-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate transition hover:bg-white/5 hover:text-white">
              Sign In
            </Link>
          ) : null}
        </nav>

        {showAuthControls && accountEmail ? (
        <div className="absolute right-2 top-1/2 hidden w-[140px] -translate-y-1/2 items-center justify-end gap-1 sm:right-3 lg:right-4 lg:flex">
          <Link href="/account" className="rounded-full border border-white/10 px-2 py-2 text-[11px] font-semibold leading-none text-slate transition hover:bg-white/5 hover:text-white">
            Account
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            title={signOutFailed ? "Sign out failed. Try again." : undefined}
            className="rounded-full border border-white/10 px-2 py-2 text-[11px] font-semibold leading-none text-slate transition hover:bg-white/5 hover:text-white"
          >
            {signingOut ? "Signing Out..." : signOutFailed ? "Retry Sign Out" : "Sign Out"}
          </button>
        </div>
        ) : null}
      </div>

      <div
        className={`fixed inset-0 top-[72px] z-[80] bg-black/55 transition lg:hidden ${
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeMobileNav}
      />

      <aside
        inert={!mobileOpen}
        aria-hidden={!mobileOpen}
        className={`fixed right-0 top-[72px] z-[90] h-[calc(100vh-72px)] w-[82vw] max-w-[340px] overflow-y-auto border-l border-white/10 bg-[#05070a] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.72)] transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-2">
          {navigation.map((item) => {
            const isActive = isActiveNavItem(item.href);
            if (item.columns?.length) {
              return (
                <ServiceMenu
                  key={item.href}
                  name={item.label}
                  columns={item.columns}
                  active={isActive}
                  open={openCategoryMenu === `mobile:${item.label}`}
                  onOpenChange={(open) => changeCategoryMenu(`mobile:${item.label}`, open)}
                  mobile
                  onNavigate={closeMobileNav}
                >
                  <NavWordmark active={isActive} alt={item.label} mobile />
                </ServiceMenu>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileNav}
                className="rounded-xl px-4 py-4 text-sm font-semibold text-white"
              >
                <NavWordmark active={isActive} alt={item.label} mobile />
              </Link>
            );
          })}
          <div className="my-3 h-px bg-white/10" />
          <Link href="/about" onClick={closeMobileNav} className="rounded-xl px-4 py-4 text-sm font-semibold text-slate transition hover:bg-white/6 hover:text-white">
            About
          </Link>
          <Link href="/news" onClick={closeMobileNav} className="rounded-xl px-4 py-4 text-sm font-semibold text-slate transition hover:bg-white/6 hover:text-white">
            News
          </Link>
          <div className="my-3 h-px bg-white/10" />
          {showAuthControls ? <div className="my-3 h-px bg-white/10" /> : null}
          {showAuthControls && accountEmail ? (
            <>
              <Link href="/account" onClick={closeMobileNav} className="rounded-xl px-4 py-4 text-sm font-semibold text-slate transition hover:bg-white/6 hover:text-white">
                Account
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={signingOut}
                title={signOutFailed ? "Sign out failed. Try again." : undefined}
                className="rounded-xl px-4 py-4 text-left text-sm font-semibold text-slate transition hover:bg-white/6 hover:text-white"
              >
                {signingOut ? "Signing Out..." : signOutFailed ? "Retry Sign Out" : "Sign Out"}
              </button>
            </>
          ) : showAuthControls ? (
            <Link href={loginHref} onClick={closeMobileNav} className="rounded-xl px-4 py-4 text-sm font-semibold text-slate transition hover:bg-white/6 hover:text-white">
              Sign In
            </Link>
          ) : null}
        </nav>
      </aside>
    </header>
  );
}
