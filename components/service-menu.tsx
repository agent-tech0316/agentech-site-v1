"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { NavItem } from "@/lib/site-data";
import "./service-menu.css";

export function ServiceMenu({
  children,
  columns,
  name,
  triggerHref,
  open,
  onOpenChange,
  active,
  mobile = false,
  onNavigate
}: {
  children: ReactNode;
  columns: NonNullable<NavItem["columns"]>;
  name: string;
  triggerHref?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonTriggerRef = useRef<HTMLButtonElement>(null);
  const linkTriggerRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFirstLink = useRef(false);
  const [openBranch, setOpenBranch] = useState<string | null>(null);

  function cancelClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function closeMenu() {
    cancelClose();
    setOpenBranch(null);
    onOpenChange(false);
  }

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!open) setOpenBranch(null);
  }, [open]);

  useEffect(() => {
    if (!open || mobile) return;
    const header = containerRef.current?.closest<HTMLElement>("[data-site-header]");
    if (!header) return;

    function keepOpen() {
      if (closeTimer.current !== null) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    }

    function leaveNavigation(event: PointerEvent) {
      if (event.pointerType === "touch" || containerRef.current?.contains(document.activeElement)) return;
      keepOpen();
      closeTimer.current = setTimeout(() => onOpenChange(false), 220);
    }

    // The whole header and its expanded panel form one pointer surface. A
    // horizontal/diagonal path must not be treated as leaving the trigger.
    header.addEventListener("pointerenter", keepOpen);
    header.addEventListener("pointerleave", leaveNavigation);
    return () => {
      header.removeEventListener("pointerenter", keepOpen);
      header.removeEventListener("pointerleave", leaveNavigation);
      keepOpen();
    };
  }, [open, mobile, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    if (focusFirstLink.current) {
      panelRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
      focusFirstLink.current = false;
    }

    function closeOutside(event: Event) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        onOpenChange(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const activeBranch = document.activeElement?.closest<HTMLElement>("[data-service-menu-branch]");
      if (openBranch && activeBranch) {
        setOpenBranch(null);
        activeBranch.querySelector<HTMLButtonElement>("[data-service-submenu-trigger]")?.focus();
        return;
      }
      if (closeTimer.current !== null) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      const restoreFocus = containerRef.current?.contains(document.activeElement);
      onOpenChange(false);
      if (restoreFocus) (linkTriggerRef.current ?? buttonTriggerRef.current)?.focus();
    }

    // Mobile expansion changes the position of sibling controls. Let their
    // click complete before collapsing, otherwise the target moves mid-click.
    const outsideEvent = mobile ? "click" : "pointerdown";
    document.addEventListener(outsideEvent, closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener(outsideEvent, closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, mobile, onOpenChange, openBranch]);

  function openFromKeyboard() {
    if (open) {
      panelRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
    } else {
      focusFirstLink.current = true;
      onOpenChange(true);
    }
  }

  const triggerContent = (
    <>
      {children}
      <svg data-service-menu-chevron aria-hidden="true" viewBox="0 0 12 12">
        <path d="M2.25 4.5 6 8.25 9.75 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
    </>
  );

  return (
    <div
      ref={containerRef}
      data-service-menu
      data-menu-name={name}
      data-mobile={mobile}
      data-open={open}
      onPointerEnter={(event) => {
        if (mobile || event.pointerType === "touch") return;
        cancelClose();
        onOpenChange(true);
      }}
      onBlur={(event) => {
        if (!mobile && !event.currentTarget.contains(event.relatedTarget)) closeMenu();
      }}
    >
      {!mobile && triggerHref ? (
        <Link
          ref={linkTriggerRef}
          href={triggerHref}
          data-service-menu-trigger
          data-cursor-intent="nav"
          aria-expanded={open}
          aria-controls={panelId}
          className={`agent-nav-link rounded-xl px-3 py-2 ${active ? "is-active" : ""}`}
          onClick={closeMenu}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            openFromKeyboard();
          }}
        >
          {triggerContent}
        </Link>
      ) : (
        <button
          ref={buttonTriggerRef}
          type="button"
          data-service-menu-trigger
          data-cursor-intent="nav"
          aria-expanded={open}
          aria-controls={panelId}
          className={`agent-nav-link rounded-xl px-3 py-2 ${active ? "is-active" : ""}`}
          onClick={() => {
            cancelClose();
            onOpenChange(!open);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            openFromKeyboard();
          }}
        >
          {triggerContent}
        </button>
      )}

      <div data-service-menu-positioner hidden={!open}>
        <div ref={panelRef} id={panelId} data-service-menu-panel hidden={!open} aria-label={`${name} categories`}>
          {columns.map((column) => {
            if (column.children?.length) {
              const branchOpen = openBranch === column.label;
              const submenuId = `${panelId}-${column.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

              return (
                <div
                  key={column.label}
                  data-service-menu-branch
                  data-open={branchOpen}
                  onPointerEnter={(event) => {
                    if (mobile || event.pointerType === "touch") return;
                    setOpenBranch(column.label);
                  }}
                  onPointerLeave={(event) => {
                    if (mobile || event.pointerType === "touch" || event.currentTarget.contains(document.activeElement)) return;
                    setOpenBranch(null);
                  }}
                >
                  <div data-service-branch-row>
                    {column.href && (
                      <Link
                        href={column.href}
                        data-service-menu-column
                        data-service-menu-link
                        data-service-branch-link
                        onClick={() => { closeMenu(); onNavigate?.(); }}
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowRight" && event.key !== "ArrowDown") return;
                          event.preventDefault();
                          setOpenBranch(column.label);
                        }}
                      >
                        <h2 data-service-menu-title>{column.label}</h2>
                      </Link>
                    )}
                    <button
                      type="button"
                      data-service-menu-column={column.href ? undefined : ""}
                      data-service-submenu-trigger
                      data-service-branch-toggle={column.href ? "" : undefined}
                      aria-label={column.href ? `Show ${column.label} services` : undefined}
                      aria-expanded={branchOpen}
                      aria-controls={submenuId}
                      onClick={() => setOpenBranch((current) => current === column.label ? null : column.label)}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowRight" && event.key !== "ArrowDown") return;
                        event.preventDefault();
                        setOpenBranch(column.label);
                      }}
                    >
                      {!column.href && <h2 data-service-menu-title>{column.label}</h2>}
                      <svg data-service-submenu-chevron aria-hidden="true" viewBox="0 0 12 12">
                        <path d="M2.25 4.5 6 8.25 9.75 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
                      </svg>
                    </button>
                  </div>

                  <div data-service-submenu-positioner hidden={!branchOpen}>
                    <div id={submenuId} data-service-submenu-panel hidden={!branchOpen} aria-label={`${column.label} services`}>
                      {column.children.map((child) => child.href ? (
                        <Link
                          key={child.label}
                          href={child.href}
                          data-service-submenu-item
                          data-service-submenu-link
                          onClick={() => { closeMenu(); onNavigate?.(); }}
                        >
                          <h3 data-service-submenu-title>{child.label}</h3>
                        </Link>
                      ) : (
                        <div key={child.label} data-service-submenu-item>
                          <h3 data-service-submenu-title>{child.label}</h3>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            if (column.href) {
              return (
                <Link
                  key={column.label}
                  href={column.href}
                  data-service-menu-column
                  data-service-menu-link
                  onPointerEnter={() => { if (!mobile) setOpenBranch(null); }}
                  onClick={() => { closeMenu(); onNavigate?.(); }}
                >
                  <h2 data-service-menu-title>{column.label}</h2>
                </Link>
              );
            }

            return (
              <div
                key={column.label}
                data-service-menu-column
                onPointerEnter={() => { if (!mobile) setOpenBranch(null); }}
              >
                <h2 data-service-menu-title>{column.label}</h2>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
