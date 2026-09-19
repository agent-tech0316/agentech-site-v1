"use client";

import { useEffect, useRef } from "react";

export function AgentCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) {
      return;
    }
    const cursorElement = cursor;

    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!finePointer.matches || reducedMotion.matches) {
      return;
    }

    let targetX = -80;
    let targetY = -80;
    let currentX = targetX;
    let currentY = targetY;
    let previousX = targetX;
    let previousY = targetY;
    let frame = 0;
    let activeIntent: Element | null = null;

    function setActiveIntent(element: Element | null) {
      if (activeIntent === element) {
        return;
      }

      activeIntent?.classList.remove("is-cursor-hovered");
      activeIntent = element;
      activeIntent?.classList.add("is-cursor-hovered");
    }

    function updateIntent(event: PointerEvent) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const intent = target?.closest("[data-cursor-intent='nav']") ?? null;
      setActiveIntent(intent);
      cursorElement.classList.toggle("is-nav", Boolean(intent));
    }

    function onPointerMove(event: PointerEvent) {
      targetX = event.clientX;
      targetY = event.clientY;
      cursorElement.classList.add("is-visible");
      updateIntent(event);
    }

    function onPointerLeave() {
      cursorElement.classList.remove("is-visible", "is-nav");
      setActiveIntent(null);
    }

    function animate() {
      currentX += (targetX - currentX) * 0.22;
      currentY += (targetY - currentY) * 0.22;

      const deltaX = currentX - previousX;
      const deltaY = currentY - previousY;
      const speed = Math.hypot(deltaX, deltaY);
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      const stretch = cursorElement.classList.contains("is-nav") ? 0 : Math.min(speed * 0.025, 0.7);

      cursorElement.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(${1 + stretch}, ${1 - Math.min(stretch * 0.34, 0.22)})`;

      previousX = currentX;
      previousY = currentY;
      frame = window.requestAnimationFrame(animate);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.cancelAnimationFrame(frame);
      setActiveIntent(null);
    };
  }, []);

  return (
    <div ref={cursorRef} className="agent-cursor" aria-hidden="true">
      <span className="agent-cursor-core" />
    </div>
  );
}
