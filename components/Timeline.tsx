"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
  file: File;
  isAudio: boolean;
  duration: number;
  start: number;
  end: number;
  current: number;
  onRange: (start: number, end: number) => void;
  onSeek: (t: number) => void;
};

const THUMBS = 10;
const BARS = 120;
const MAX_WAVE_BYTES = 150 * 1024 * 1024;

function once(el: HTMLMediaElement, ev: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => {
      el.removeEventListener("error", bad);
      resolve();
    };
    const bad = () => {
      el.removeEventListener(ev, ok);
      reject(new Error("media error"));
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

async function makeThumbs(url: string, count: number, alive: () => boolean) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  await once(v, "loadeddata");
  const h = 72;
  const w = Math.max(40, Math.round((h * v.videoWidth) / (v.videoHeight || 1)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const out: string[] = [];
  for (let i = 0; i < count && alive(); i++) {
    v.currentTime = ((i + 0.5) * v.duration) / count;
    await once(v, "seeked");
    ctx?.drawImage(v, 0, 0, w, h);
    out.push(c.toDataURL("image/jpeg", 0.6));
  }
  v.removeAttribute("src");
  v.load();
  return out;
}

async function makePeaks(file: File, bars: number) {
  type WinAC = typeof window & { webkitAudioContext?: typeof AudioContext };
  const AC = window.AudioContext ?? (window as WinAC).webkitAudioContext;
  if (!AC) return [];
  const ac = new AC();
  try {
    const buf = await ac.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.floor(data.length / bars) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = i * step; j < (i + 1) * step && j < data.length; j += 16) {
        const a = Math.abs(data[j]);
        if (a > max) max = a;
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    return peaks.map((p) => p / top);
  } finally {
    void ac.close();
  }
}

export default function Timeline({
  url,
  file,
  isAudio,
  duration,
  start,
  end,
  current,
  onRange,
  onSeek,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<"start" | "end" | "seek" | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    if (isAudio) {
      if (file.size <= MAX_WAVE_BYTES) {
        makePeaks(file, BARS)
          .then((p) => alive && setPeaks(p))
          .catch(() => {});
      }
    } else {
      makeThumbs(url, THUMBS, () => alive)
        .then((t) => alive && setThumbs(t))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [url, file, isAudio]);

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  function timeAt(clientX: number) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || duration <= 0) return 0;
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    return (x / r.width) * duration;
  }

  function apply(clientX: number) {
    const t = timeAt(clientX);
    const gap = Math.min(0.1, duration);
    if (drag.current === "start") onRange(Math.min(t, end - gap), end);
    else if (drag.current === "end") onRange(start, Math.max(t, start + gap));
    else if (drag.current === "seek") onSeek(t);
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    drag.current = (h?.dataset.handle as "start" | "end") ?? "seek";
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(e.clientX);
  }

  function onKey(which: "start" | "end", e: React.KeyboardEvent) {
    const step = e.shiftKey ? 1 : 0.1;
    let d = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") d = step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -step;
    else return;
    e.preventDefault();
    if (which === "start") onRange(Math.max(0, Math.min(start + d, end - 0.1)), end);
    else onRange(start, Math.min(duration, Math.max(end + d, start + 0.1)));
  }

  const ticks = 5;

  return (
    <div className="timeline" dir="ltr">
      <div
        ref={ref}
        className="tl-track"
        onPointerDown={onDown}
        onPointerMove={(e) => drag.current && apply(e.clientX)}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="tl-media">
          {isAudio ? (
            <div className="tl-wave">
              {(peaks.length ? peaks : Array.from({ length: BARS }, () => 0.08)).map(
                (p, i) => (
                  <span key={i} style={{ height: `${Math.max(6, p * 100)}%` }} />
                ),
              )}
            </div>
          ) : (
            <div className="tl-thumbs">
              {thumbs.length
                ? thumbs.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" draggable={false} />
                  ))
                : Array.from({ length: THUMBS }, (_, i) => (
                    <span key={i} className="tl-skel" />
                  ))}
            </div>
          )}
        </div>

        <div className="tl-dim" style={{ left: 0, width: `${pct(start)}%` }} />
        <div className="tl-dim" style={{ left: `${pct(end)}%`, right: 0 }} />

        <div
          className="tl-sel"
          style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
        >
          <div
            className="tl-handle start"
            data-handle="start"
            role="slider"
            tabIndex={0}
            aria-label="Start"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={start}
            onKeyDown={(e) => onKey("start", e)}
          >
            <i />
          </div>
          <div
            className="tl-handle end"
            data-handle="end"
            role="slider"
            tabIndex={0}
            aria-label="End"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={end}
            onKeyDown={(e) => onKey("end", e)}
          >
            <i />
          </div>
        </div>

        <div className="tl-head" style={{ left: `${pct(current)}%` }} />
      </div>

      <div className="tl-ticks">
        {Array.from({ length: ticks }, (_, i) => {
          const t = Math.round((duration * i) / (ticks - 1));
          const m = Math.floor(t / 60);
          const s = t % 60;
          return (
            <span key={i}>
              {m}:{String(s).padStart(2, "0")}
            </span>
          );
        })}
      </div>
    </div>
  );
}
