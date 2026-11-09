"use client";

import { useEffect, useRef } from "react";

/**
 * Animated page background: drifting aurora blobs (CSS), flowing
 * waveform lines (canvas) that bend toward the pointer, a fading grid
 * and film grain. Also wires two small page effects: spotlight hover on
 * `.spot` cards and reveal-on-scroll for `[data-reveal]` elements.
 */
export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0;
    let h = 0;
    let raf = 0;
    let t = 0;
    let last = performance.now();
    const mouse = { x: -9999, y: 0, tx: -9999, ty: 0, power: 0, target: 0 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      const small = w < 640;
      const lines = small ? 4 : 7;
      const baseY = h * (small ? 0.3 : 0.34);
      const amp = Math.min(h * 0.14, 130);
      const step = small ? 10 : 6;

      mouse.x += (mouse.tx - mouse.x) * 0.08;
      mouse.y += (mouse.ty - mouse.y) * 0.08;
      mouse.power += (mouse.target - mouse.power) * 0.05;

      const grad = ctx!.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "rgba(124, 92, 255, 0)");
      grad.addColorStop(0.2, "rgba(124, 92, 255, 1)");
      grad.addColorStop(0.55, "rgba(56, 189, 248, 1)");
      grad.addColorStop(0.8, "rgba(34, 211, 238, 1)");
      grad.addColorStop(1, "rgba(34, 211, 238, 0)");
      ctx!.strokeStyle = grad;

      const mid = Math.floor(lines / 2);
      for (let i = 0; i < lines; i++) {
        const k = i / (lines - 1 || 1);
        const phase = i * 0.7;
        const path = new Path2D();
        for (let x = -step; x <= w + step; x += step) {
          const nx = x / w;
          const env = Math.sin(Math.PI * Math.min(1, Math.max(0, nx)));
          let y =
            baseY +
            (k - 0.5) * amp * 0.9 +
            Math.sin(nx * 6.5 + t * 0.6 + phase) * amp * 0.45 * env +
            Math.sin(nx * 13 - t * 0.9 + phase * 1.7) * amp * 0.18 * env;
          const dx = x - mouse.x;
          const bump = Math.exp(-(dx * dx) / (2 * 140 * 140));
          y += (mouse.y - y) * bump * 0.35 * mouse.power;
          if (x === -step) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
        const strength = 1 - Math.abs(k - 0.5) * 2;
        // soft glow pass
        ctx!.globalAlpha = 0.06 + strength * 0.1;
        ctx!.lineWidth = i === mid ? 10 : 6;
        ctx!.stroke(path);
        // crisp line
        ctx!.globalAlpha = 0.25 + strength * 0.55;
        ctx!.lineWidth = i === mid ? 2.2 : 1.3;
        ctx!.stroke(path);
      }
      ctx!.globalAlpha = 1;
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      if (reduce.matches) {
        draw();
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX;
      mouse.ty = e.clientY;
      mouse.target = 1;
      if (mouse.x < -9000) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
    };
    const onLeave = () => (mouse.target = 0);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    };

    resize();
    start();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    reduce.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      reduce.removeEventListener("change", start);
    };
  }, []);

  // Spotlight hover on cards
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".spot");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Reveal on scroll
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="bg" aria-hidden="true">
      <div className="aurora">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>
      <div className="bg-grid" />
      <canvas ref={canvasRef} className="waves" />
      <div className="vignette" />
      <div className="grain" />
    </div>
  );
}
