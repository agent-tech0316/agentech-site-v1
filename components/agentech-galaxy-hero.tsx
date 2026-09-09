"use client";

import Image from "next/image";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";
import {
  createGalaxyFrameLoop,
  createGalaxyInteractionController,
  getGalaxyPointerIntent,
  getGalaxyPerformanceProfile,
  isPointInsideGalaxyPointerEllipse,
  type GalaxyPointerEllipse,
  type GalaxyPointerRect,
} from "@/lib/agentech-galaxy-interaction";
import { getGalaxyFormationCenter, getGalaxySpiralAngle } from "@/lib/agentech-galaxy-rendering";

type AgentechGalaxyHeroProps = {
  title: string;
  titleImage?: string;
  subtitle?: string;
  children?: ReactNode;
  bottomContent?: ReactNode;
  lockedViewport?: boolean;
};

export function AgentechGalaxyHero({
  title,
  titleImage,
  subtitle,
  children,
  bottomContent,
  lockedViewport = false
}: AgentechGalaxyHeroProps) {
  const heroRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wordmarkRef = useRef<HTMLImageElement | null>(null);
  const interactionLayerRef = useRef<HTMLDivElement | null>(null);
  const bottomContentRef = useRef<HTMLDivElement | null>(null);
  const touchPointerIdRef = useRef<number | null>(null);
  const interactionApiRef = useRef<{
    enterHover: () => void;
    leaveHover: () => void;
    moveMouse: (clientX: number, clientY: number) => void;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    const wordmarkEl = wordmarkRef.current;
    const interactionLayer = interactionLayerRef.current;
    const bottomContentEl = bottomContentRef.current;
    if (!canvas || !hero || !interactionLayer) return;
    const canvasEl = canvas;
    const heroEl = hero;

    const ctx = canvasEl.getContext("2d", { alpha: true });
    if (!ctx) return;
    const ctxEl = ctx;
    const staticCanvas = document.createElement("canvas");
    const staticCtx = staticCanvas.getContext("2d", { alpha: true });
    if (!staticCtx) return;
    const staticCtxEl = staticCtx;
    const targetCanvas = document.createElement("canvas");
    const targetCtx = targetCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!targetCtx) return;
    const targetCtxEl = targetCtx;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wordmarkMask = titleImage ? new window.Image() : null;
    let wordmarkGeometry: { offsetX: number; offsetY: number; scale: number } | null = null;
    let initialWordmarkBounds: GalaxyPointerRect | null = null;
    let formationWordmarkBounds: GalaxyPointerRect | null = null;
    let galaxyPointerBounds: GalaxyPointerEllipse | null = null;
    let galaxyEntryArmed = true;
    let lastWordmarkProgress: number | null = null;
    let lastMouseIntent: "assemble" | "release" | null = null;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let t = 0;
    let previousFrameTime: number | null = null;
    let particleCount = 0;
    let reducedMotion = motionQuery.matches;
    let disposed = false;
    let resizeTimer: number | undefined;
    let controller = createGalaxyInteractionController({
      now: () => performance.now(),
      reducedMotion,
    });
    let frameLoop: ReturnType<typeof createGalaxyFrameLoop>;
    const particlePalette = ["233,239,244", "214,227,238", "198,216,230", "162,190,212", "186,205,221", "108,182,228", "224,232,239"];
    const particlePaths = Array.from({ length: particlePalette.length }, () =>
      Array.from({ length: 8 }, () => new Path2D()),
    );
    const particles: Array<{
      r: number;
      arm: number;
      drift: number;
      spin: number;
      depth: number;
      spread: number;
      size: number;
      alpha: number;
      phase: number;
      colorIndex: number;
      targetX: number;
      targetY: number;
      targetSize: number;
      targetAlpha: number;
    }> = [];

    const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const smoothstep = (value: number) => {
      const clamped = Math.min(1, Math.max(0, value));
      return clamped * clamped * (3 - 2 * clamped);
    };

    function resize() {
      w = Math.max(1, canvasEl.clientWidth);
      h = Math.max(1, canvasEl.clientHeight);
      const profile = getGalaxyPerformanceProfile({
        width: w,
        height: h,
        devicePixelRatio: window.devicePixelRatio || 1,
        reducedMotion,
      });
      dpr = profile.dpr;
      particleCount = profile.particleCount;
      canvasEl.width = Math.floor(w * dpr);
      canvasEl.height = Math.floor(h * dpr);
      staticCanvas.width = canvasEl.width;
      staticCanvas.height = canvasEl.height;
      ctxEl.setTransform(dpr, 0, 0, dpr, 0, 0);
      staticCtxEl.setTransform(dpr, 0, 0, dpr, 0, 0);
      heroEl.dataset.galaxyPerformanceTier = profile.tier;
      heroEl.dataset.galaxyParticleCount = String(profile.particleCount);
      heroEl.dataset.galaxyDpr = String(profile.dpr);
    }

    function buildParticles() {
      particles.length = 0;
      const formationCenter = getFormationMetrics();

      for (let i = 0; i < particleCount; i++) {
        const r = Math.pow(Math.random(), 0.58);
        const arm = Math.random() < 0.5 ? 0 : Math.PI;
        const drift = rand(-0.8, 0.8);
        const spin = lerp(0.02, 0.12, Math.random());
        const depth = Math.random();
        const spread = lerp(0.04, 0.42, Math.pow(r, 0.9));
        const size = lerp(0.3, 1.5, Math.random()) * (1.3 - r * 0.62);
        const alpha = lerp(0.12, 0.88, Math.random());
        const phase = rand(Math.PI * 2, 0);

        let colorIndex = 0;
        if (r < 0.18) colorIndex = Math.random() < 0.5 ? 1 : 2;
        else if (r < 0.35) colorIndex = Math.random() < 0.6 ? 3 : 4;
        else colorIndex = Math.random() < 0.7 ? 5 : 6;

        particles.push({
          r,
          arm,
          drift,
          spin,
          depth,
          spread,
          size,
          alpha,
          phase,
          colorIndex,
          targetX: formationCenter.x,
          targetY: formationCenter.y,
          targetSize: 1,
          targetAlpha: 0.9,
        });
      }
    }

    function getGalaxyMetrics() {
      const cx = w * 0.5;
      const isDesktop = w >= 768;
      const cy = h * (w < 640 ? 0.31 : isDesktop ? 0.24 : 0.34);
      const scale = Math.min(w, h);
      const rx = isDesktop ? Math.max(w * 0.88, scale * 1.35) : w * 0.88;
      const ry = isDesktop ? Math.max(h * 0.29, scale * 0.3) : Math.min(h * 0.24, w * 0.24);

      return { cx, cy, isDesktop, rx, ry };
    }

    function getFormationMetrics() {
      return getGalaxyFormationCenter({
        canvasWidth: w,
        canvasHeight: h,
        bottomContentHeight: bottomContentEl?.offsetHeight ?? 0,
      });
    }

    function buildGalaxyPointerBounds() {
      const { cx, cy, rx, ry } = getGalaxyMetrics();
      galaxyPointerBounds = {
        centerX: cx,
        centerY: cy,
        radiusX: Math.min(w * 0.46, rx * 0.55),
        radiusY: Math.min(h * 0.25, ry * 0.72),
        rotation: -0.12,
      };
      heroEl.dataset.galaxyEntryArmed = String(galaxyEntryArmed);
    }

    function buildWordTargets() {
      targetCanvas.width = Math.max(1, Math.floor(w));
      targetCanvas.height = Math.max(1, Math.floor(h));
      targetCtxEl.setTransform(1, 0, 0, 1, 0, 0);
      targetCtxEl.clearRect(0, 0, w, h);

      const formationCenter = getFormationMetrics();
      const { x: formationCenterX, y: formationCenterY } = formationCenter;
      heroEl.dataset.galaxyFormationCenterX = formationCenterX.toFixed(2);
      heroEl.dataset.galaxyFormationCenterY = formationCenterY.toFixed(2);
      heroEl.dataset.galaxyFormationVisualHeight = formationCenter.visualHeight.toFixed(2);
      const fontSize =
        w <= 430
          ? Math.min(w * 0.135, h * 0.09)
          : Math.min(w * 0.112, h * 0.16, 144);
      targetCtxEl.fillStyle = "#fff";
      targetCtxEl.font = `700 ${fontSize}px Oxanium, Arial Narrow, sans-serif`;
      targetCtxEl.textAlign = "center";
      targetCtxEl.textBaseline = "middle";
      const letterSpacedContext = targetCtxEl as CanvasRenderingContext2D & { letterSpacing?: string };
      if ("letterSpacing" in letterSpacedContext) {
        letterSpacedContext.letterSpacing = `${fontSize * 0.035}px`;
      }
      const anchor = wordmarkEl;
      if (wordmarkMask?.naturalWidth && anchor?.offsetWidth) {
        // Sample the actual brand artwork so both layers share identical glyphs.
        const targetWidth = Math.min(w * 0.84, 1000);
        const targetHeight = targetWidth * wordmarkMask.naturalHeight / wordmarkMask.naturalWidth;
        targetCtxEl.drawImage(
          wordmarkMask,
          formationCenterX - targetWidth / 2,
          formationCenterY - targetHeight / 2,
          targetWidth,
          targetHeight,
        );
        // offset layout ignores the independent entrance animation and our own
        // per-frame transform, so resize/hover reversal cannot accumulate drift.
        let left = 0;
        let top = 0;
        let node: HTMLElement | null = anchor;
        while (node && node !== heroEl) {
          left += node.offsetLeft;
          top += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        wordmarkGeometry = {
          offsetX: formationCenterX - (left + anchor.offsetWidth / 2),
          offsetY: formationCenterY - (top + anchor.offsetHeight / 2),
          scale: targetWidth / anchor.offsetWidth,
        };
        initialWordmarkBounds = {
          left,
          top,
          right: left + anchor.offsetWidth,
          bottom: top + anchor.offsetHeight,
        };
        lastWordmarkProgress = null;
        heroEl.dataset.galaxyWordmarkSource = "brand-image";
      } else {
        targetCtxEl.fillText("AGENTECH", formationCenterX, formationCenterY, w * 0.9);
      }

      const pixels = targetCtxEl.getImageData(0, 0, targetCanvas.width, targetCanvas.height).data;
      const sampleStep = w <= 430 ? 2 : 3;
      const targets: Array<{ x: number; y: number }> = [];

      for (let y = 0; y < targetCanvas.height; y += sampleStep) {
        for (let x = 0; x < targetCanvas.width; x += sampleStep) {
          if (pixels[(y * targetCanvas.width + x) * 4 + 3] > 96) {
            targets.push({ x, y });
          }
        }
      }

      if (targets.length > 0) {
        let minX = targets[0].x;
        let maxX = targets[0].x;
        let minY = targets[0].y;
        let maxY = targets[0].y;
        for (const target of targets) {
          minX = Math.min(minX, target.x);
          maxX = Math.max(maxX, target.x);
          minY = Math.min(minY, target.y);
          maxY = Math.max(maxY, target.y);
        }
        heroEl.dataset.galaxyTargetCenterX = ((minX + maxX) / 2).toFixed(2);
        heroEl.dataset.galaxyTargetCenterY = ((minY + maxY) / 2).toFixed(2);
        formationWordmarkBounds = { left: minX, top: minY, right: maxX, bottom: maxY };
      }

      for (let i = targets.length - 1; i > 0; i--) {
        const swapIndex = Math.floor(Math.random() * (i + 1));
        [targets[i], targets[swapIndex]] = [targets[swapIndex], targets[i]];
      }

      if (targets.length === 0) return;
      const targetSize = w <= 430 ? 1.05 : 1.25;
      for (let i = 0; i < particles.length; i++) {
        const target = targets[i % targets.length];
        particles[i].targetX = target.x + rand(0.9, -0.9);
        particles[i].targetY = target.y + rand(0.9, -0.9);
        particles[i].targetSize = targetSize * rand(1.15, 0.78);
        particles[i].targetAlpha = rand(1, 0.78);
      }
    }

    function drawBg(targetCtx: CanvasRenderingContext2D) {
      targetCtx.clearRect(0, 0, w, h);
      const g = targetCtx.createRadialGradient(w * 0.5, h * 0.54, 0, w * 0.5, h * 0.54, Math.max(w, h) * 0.72);
      g.addColorStop(0, "rgba(10,12,15,0.16)");
      g.addColorStop(0.32, "rgba(7,10,14,0.28)");
      g.addColorStop(0.72, "rgba(3,5,7,0.8)");
      g.addColorStop(1, "rgba(2,3,5,1)");
      targetCtx.fillStyle = g;
      targetCtx.fillRect(0, 0, w, h);
    }

    function fillEllipticGlow(
      targetCtx: CanvasRenderingContext2D,
      {
        blur = 0,
        cx,
        cy,
        innerRadius = 0,
        radiusX,
        radiusY,
        rotation = 0,
        stops
      }: {
        blur?: number;
        cx: number;
        cy: number;
        innerRadius?: number;
        radiusX: number;
        radiusY: number;
        rotation?: number;
        stops: Array<[number, string]>;
      }
    ) {
      targetCtx.save();
      targetCtx.translate(cx, cy);
      targetCtx.rotate(rotation);
      if (blur > 0) targetCtx.filter = `blur(${blur}px)`;
      targetCtx.scale(1, radiusY / radiusX);

      const gradient = targetCtx.createRadialGradient(0, 0, innerRadius, 0, 0, radiusX);
      for (const [stop, color] of stops) {
        gradient.addColorStop(stop, color);
      }
      targetCtx.fillStyle = gradient;
      targetCtx.beginPath();
      targetCtx.arc(0, 0, radiusX, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.restore();
    }

    function drawSoftClouds(targetCtx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
      const broad = 0.22;
      const rim = 0.26;
      const core = 0.92;

      fillEllipticGlow(targetCtx, {
        blur: 12,
        cx,
        cy,
        radiusX: rx * 1.2,
        radiusY: ry * 1.08,
        rotation: -0.12,
        stops: [
          [0, `rgba(118,182,226,${0.12 * broad})`],
          [0.25, `rgba(92,156,206,${0.08 * broad})`],
          [0.58, `rgba(168,208,236,${0.04 * broad})`],
          [0.84, `rgba(168,208,236,${0.006 * broad})`],
          [1, "rgba(0,0,0,0)"]
        ]
      });

      fillEllipticGlow(targetCtx, {
        blur: 4,
        cx,
        cy,
        radiusX: rx * 0.46,
        radiusY: ry * 0.42,
        rotation: -0.12,
        stops: [
          [0, `rgba(214,236,248,${0.2 * core})`],
          [0.42, `rgba(112,190,234,${0.11 * core})`],
          [0.82, `rgba(112,190,234,${0.02 * core})`],
          [1, "rgba(0,0,0,0)"]
        ]
      });

      fillEllipticGlow(targetCtx, {
        blur: 10,
        cx,
        cy,
        innerRadius: rx * 0.6,
        radiusX: rx * 1.25,
        radiusY: ry * 1.12,
        rotation: -0.12,
        stops: [
          [0, "rgba(0,0,0,0)"],
          [0.68, `rgba(76,150,206,${0.018 * rim})`],
          [0.88, `rgba(94,186,242,${0.11 * rim})`],
          [1, "rgba(0,0,0,0)"]
        ]
      });
    }

    function drawCore(
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      tt: number,
      opacity: number,
    ) {
      if (opacity <= 0.01) return;
      ctxEl.save();
      ctxEl.globalAlpha = opacity;
      const pulse = 1 + Math.sin(tt * 1.6) * 0.03;
      const boost = 1.16;
      fillEllipticGlow(ctxEl, {
        blur: 0,
        cx,
        cy,
        radiusX: rx * 0.24 * pulse,
        radiusY: ry * 0.23 * pulse,
        stops: [
          [0, `rgba(227,236,242,${0.56 * boost})`],
          [0.3, `rgba(168,194,214,${0.25 * boost})`],
          [0.74, `rgba(104,141,171,${0.1 * boost})`],
          [1, "rgba(0,0,0,0)"]
        ]
      });
      ctxEl.restore();
    }

    function renderStaticLayer() {
      const { cx, cy, rx, ry } = getGalaxyMetrics();
      drawBg(staticCtxEl);
      drawSoftClouds(staticCtxEl, cx, cy, rx, ry);
    }

    function updateAccessibleState(progress: number, phase: string) {
      heroEl.dataset.galaxyProgress = progress.toFixed(3);
      heroEl.dataset.galaxyPhase = phase;
    }

    function drawGalaxy(frameTime = performance.now()) {
      const interaction = controller.tick();
      const formation = smoothstep(interaction.progress);
      const wordmark = wordmarkEl;
      if (wordmark && wordmarkGeometry && lastWordmarkProgress !== interaction.progress) {
        const travel = smoothstep(interaction.progress / 0.82);
        const dissolve = smoothstep((interaction.progress - 0.45) / 0.5);
        wordmark.style.transform = `translate3d(${wordmarkGeometry.offsetX * travel}px, ${wordmarkGeometry.offsetY * travel}px, 0) scale(${lerp(1, wordmarkGeometry.scale, travel)})`;
        wordmark.style.opacity = String(1 - dissolve);
        lastWordmarkProgress = interaction.progress;
      }
      if (!reducedMotion && previousFrameTime !== null) {
        t += Math.min(50, Math.max(0, frameTime - previousFrameTime)) * 0.00016;
      }
      previousFrameTime = frameTime;
      ctxEl.clearRect(0, 0, w, h);
      ctxEl.globalCompositeOperation = "source-over";
      ctxEl.filter = "none";
      ctxEl.drawImage(staticCanvas, 0, 0, w, h);
      if (formation > 0.01) {
        ctxEl.fillStyle = `rgba(2,3,5,${formation * 0.58})`;
        ctxEl.fillRect(0, 0, w, h);
      }

      const { cx, cy, isDesktop, rx, ry } = getGalaxyMetrics();
      ctxEl.globalCompositeOperation = "lighter";
      const rotation = -0.12;
      const rotationCos = Math.cos(rotation);
      const rotationSin = Math.sin(rotation);

      for (const pathsForColor of particlePaths) {
        for (let alphaBucket = 0; alphaBucket < pathsForColor.length; alphaBucket++) {
          pathsForColor[alphaBucket] = new Path2D();
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const r = p.r;
        const base = p.arm + p.drift * 0.42;
        const spiral = getGalaxySpiralAngle(base, r, t, p.phase, p.spin);

        let x = Math.cos(spiral) * rx * r;
        let y = Math.sin(spiral) * ry * r;

        const tangent = Math.sin(spiral * 1.38 + t * 1.74 + p.phase) * (10 + 18 * r) * p.spread;
        x += Math.cos(spiral + Math.PI / 2) * tangent;
        y += Math.sin(spiral + Math.PI / 2) * tangent * 0.5;

        const flatten = 1 - Math.pow(r, 1.4) * 0.18;
        y *= flatten;

        const drift = Math.sin(t * 1.16 + p.phase + r * 10) * (0.45 + p.depth * 1.05);
        y += drift;

        const galaxyX = cx + x * rotationCos - y * rotationSin;
        const galaxyY = cy + x * rotationSin + y * rotationCos;
        const drawX = lerp(galaxyX, p.targetX, formation);
        const drawY = lerp(galaxyY, p.targetY, formation);

        const glow = 0.72 + 0.28 * Math.sin(t * 3 + p.phase * 2);
        const centerBoost = isDesktop && r < 0.38 ? 1.22 : 1;
        const alphaBase = isDesktop ? 0.26 + (1 - r) * 1.08 : 0.2 + (1 - r) * 0.92;
        const galaxyAlpha = Math.min(1, p.alpha * alphaBase * glow * centerBoost);
        const galaxySize = p.size * (isDesktop ? 1 + (1 - r) * 1.15 : 0.9 + (1 - r) * 1.05);
        const alpha = lerp(galaxyAlpha, p.targetAlpha, formation);
        const radius = Math.max(0.3, lerp(galaxySize, p.targetSize * 0.65, formation));

        const alphaBucket = Math.min(7, Math.floor(alpha * 8));
        const starPath = particlePaths[p.colorIndex][alphaBucket];
        starPath.moveTo(drawX + radius, drawY);
        starPath.arc(drawX, drawY, radius, 0, Math.PI * 2);
      }

      for (let colorIndex = 0; colorIndex < particlePaths.length; colorIndex++) {
        for (let alphaBucket = 0; alphaBucket < particlePaths[colorIndex].length; alphaBucket++) {
          ctxEl.fillStyle = `rgba(${particlePalette[colorIndex]},${(alphaBucket + 0.75) / 8})`;
          ctxEl.fill(particlePaths[colorIndex][alphaBucket]);
        }
      }

      ctxEl.globalCompositeOperation = "source-over";
      drawCore(cx, cy, rx, ry, t, 1 - formation);
      updateAccessibleState(interaction.progress, interaction.phase);
    }

    function renderLayers() {
      resize();
      buildGalaxyPointerBounds();
      buildParticles();
      buildWordTargets();
      renderStaticLayer();
      lastMouseIntent = null;
    }

    function makeFrameLoop() {
      return createGalaxyFrameLoop({
        reducedMotion,
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (id) => window.cancelAnimationFrame(id),
        onFrame: drawGalaxy,
      });
    }

    function requestInteractionFrame() {
      if (reducedMotion || document.hidden) drawGalaxy();
    }

    interactionApiRef.current = {
      enterHover() {
        controller.enterHover();
        requestInteractionFrame();
      },
      leaveHover() {
        galaxyEntryArmed = true;
        heroEl.dataset.galaxyEntryArmed = "true";
        lastMouseIntent = "release";
        controller.leaveHover();
        requestInteractionFrame();
      },
      moveMouse(clientX, clientY) {
        if (!initialWordmarkBounds || !formationWordmarkBounds || !galaxyPointerBounds) return;
        const heroBounds = heroEl.getBoundingClientRect();
        const snapshot = controller.snapshot();
        const point = { x: clientX - heroBounds.left, y: clientY - heroBounds.top };
        const tolerance = w <= 430 ? 8 : 12;
        const insideGalaxy = isPointInsideGalaxyPointerEllipse(point, galaxyPointerBounds, tolerance);
        if (!insideGalaxy) {
          galaxyEntryArmed = true;
        }
        const intent = getGalaxyPointerIntent({
          point,
          initialBounds: initialWordmarkBounds,
          formationBounds: formationWordmarkBounds,
          galaxyBounds: galaxyPointerBounds,
          galaxyEntryArmed,
          phase: snapshot.phase,
          progress: snapshot.progress,
          tolerance,
        });
        if (insideGalaxy && intent === "release") {
          galaxyEntryArmed = false;
        }
        if (intent === "assemble" && (snapshot.phase === "idle" || snapshot.progress <= 0)) {
          galaxyEntryArmed = false;
        }
        heroEl.dataset.galaxyPointerIntent = intent;
        heroEl.dataset.galaxyEntryArmed = String(galaxyEntryArmed);
        if (intent === lastMouseIntent) return;
        lastMouseIntent = intent;
        if (intent === "assemble") controller.enterHover();
        else controller.leaveHover();
        requestInteractionFrame();
      },
    };

    renderLayers();
    frameLoop = makeFrameLoop();
    heroEl.dataset.galaxyAnimationState = reducedMotion ? "reduced" : "active";
    frameLoop.start();
    if (wordmarkMask && titleImage) {
      wordmarkMask.onload = () => {
        if (disposed) return;
        buildWordTargets();
        if (reducedMotion) drawGalaxy();
      };
      wordmarkMask.src = titleImage;
    }

    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        renderLayers();
        if (reducedMotion) drawGalaxy();
      }, 80);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        frameLoop.pause();
        heroEl.dataset.galaxyAnimationState = "paused";
      } else {
        frameLoop.resume();
        heroEl.dataset.galaxyAnimationState = reducedMotion ? "reduced" : "active";
      }
    };

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      frameLoop.dispose();
      reducedMotion = event.matches;
      controller = createGalaxyInteractionController({
        now: () => performance.now(),
        reducedMotion,
      });
      renderLayers();
      frameLoop = makeFrameLoop();
      heroEl.dataset.galaxyAnimationState = reducedMotion ? "reduced" : "active";
      frameLoop.start();
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionQuery.addEventListener("change", onMotionPreferenceChange);
    void document.fonts?.ready.then(() => {
      if (disposed) return;
      buildWordTargets();
      if (reducedMotion) drawGalaxy();
    });

    return () => {
      disposed = true;
      frameLoop.dispose();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionPreferenceChange);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (wordmarkMask) wordmarkMask.onload = null;
      if (wordmarkEl) {
        wordmarkEl.style.removeProperty("transform");
        wordmarkEl.style.removeProperty("opacity");
      }
      touchPointerIdRef.current = null;
      interactionApiRef.current = null;
    };
  }, [titleImage]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    interactionApiRef.current?.moveMouse(event.clientX, event.clientY);
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    interactionApiRef.current?.leaveHover();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.pointerType === "mouse") return;
    touchPointerIdRef.current = event.pointerId;
    interactionApiRef.current?.enterHover();
  };

  const finishTouchInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (touchPointerIdRef.current !== event.pointerId) return;
    touchPointerIdRef.current = null;
    interactionApiRef.current?.leaveHover();
  };

  return (
    <section
      ref={heroRef}
      data-agentech-galaxy-hero
      data-agentech-galaxy-locked={lockedViewport ? "true" : "false"}
      className={
        lockedViewport
          ? "relative h-[calc(100svh-72px)] w-full overflow-hidden bg-black text-white"
          : "relative min-h-[calc(100svh-72px-88px)] w-full overflow-hidden border-b border-[#363d45]/70 bg-black text-white md:min-h-[88svh]"
      }
    >
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(188,206,222,0.03),transparent_16%),radial-gradient(circle_at_center,rgba(108,147,176,0.05),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/80 to-transparent" />

      <div
        ref={interactionLayerRef}
        data-agentech-galaxy-interaction
        aria-hidden="true"
        className="absolute inset-0 z-[15] cursor-default touch-pan-y select-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={finishTouchInteraction}
        onPointerCancel={finishTouchInteraction}
      />

      <div
        data-agentech-galaxy-content
        className={
          lockedViewport
            ? "pointer-events-none relative z-10 mx-auto flex h-full max-w-7xl justify-center px-5 pb-28 pt-[48svh] text-center sm:px-6 sm:pb-32 sm:pt-[50svh] md:px-10 md:pb-32 md:pt-[52svh] lg:px-8 lg:pt-[54svh]"
            : "pointer-events-none relative z-10 mx-auto flex min-h-[calc(100svh-72px-88px)] max-w-7xl justify-center px-5 pb-10 pt-[43svh] text-center sm:px-6 md:min-h-[88svh] md:px-10 md:pb-16 md:pt-[56svh] lg:px-8 lg:pb-20 lg:pt-[58svh]"
        }
      >
        <div className="galaxy-rise max-w-6xl">
          {titleImage ? (
            <Image
              ref={wordmarkRef}
              data-agentech-galaxy-wordmark
              src={titleImage}
              alt={title}
              width={1000}
              height={101}
              className={lockedViewport
                ? "mx-auto h-auto w-full max-w-[82vw] origin-center will-change-[transform,opacity] drop-shadow-[0_28px_78px_rgba(104,190,234,0.28)] sm:max-w-3xl lg:max-w-5xl"
                : "mx-auto h-auto w-full max-w-5xl origin-center will-change-[transform,opacity] drop-shadow-[0_28px_78px_rgba(104,190,234,0.28)]"}
              priority
            />
          ) : (
            <h1 className="hero-wordmark text-[3.8rem] tracking-[0.1em] md:text-[6rem] lg:text-[8.4rem]">
              {title}
            </h1>
          )}
          {subtitle ? <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/62 md:text-base">{subtitle}</p> : null}
          {children ? <div className="mt-10 flex flex-wrap items-center justify-center gap-4">{children}</div> : null}
        </div>
      </div>

      {bottomContent ? (
        <div
          ref={bottomContentRef}
          data-agentech-galaxy-bottom-content
          className="absolute inset-x-0 bottom-0 z-20 border-t border-[#363d45]/70 bg-black/70 py-4 backdrop-blur-sm sm:py-5"
        >
          {bottomContent}
        </div>
      ) : null}
    </section>
  );
}
