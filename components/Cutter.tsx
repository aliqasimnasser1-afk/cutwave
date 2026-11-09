"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftToLine,
  ArrowRightToLine,
  CheckCircle2,
  Cpu,
  Download,
  FileAudio,
  FileVideo,
  Gauge,
  HardDrive,
  Loader2,
  Minimize2,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Scissors,
  Share2,
  Sparkles,
  Square,
  UploadCloud,
  Volume1,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import Timeline from "./Timeline";
import {
  canUseThreads,
  canUseWebCodecs,
  JobAborted,
  planCompress,
  preloadEngine,
  runJob,
  type EngineKind,
  type Mode,
} from "@/lib/engines";

type Result = {
  url: string;
  blob: Blob;
  name: string;
  bytes: number;
  engine: EngineKind;
};

// Output is held in browser memory (wasm heap ~2 GB); keep a safety margin.
const MAX_OUTPUT = 1.5 * 1024 ** 3;
const MP3_BYTES_PER_SEC = 192_000 / 8;
const MB = 1024 * 1024;

const PRESETS = [
  { mb: 10, label: "10 MB", hint: "ديسكورد" },
  { mb: 16, label: "16 MB", hint: "واتساب" },
  { mb: 25, label: "25 MB", hint: "إيميل" },
  { mb: 50, label: "50 MB", hint: "تيليجرام" },
];

const ENGINE_LABEL: Record<EngineKind, string> = {
  webcodecs: "WebCodecs · تسريع العتاد",
  "ffmpeg-mt": "FFmpeg · متعدد الأنوية",
  ffmpeg: "FFmpeg",
};

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = s.toFixed(1).padStart(4, "0");
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${ss}`
    : `${String(m).padStart(2, "0")}:${ss}`;
}

function parseTime(v: string): number | null {
  const parts = v.trim().split(":");
  if (parts.length > 3 || parts.some((p) => p === "" || isNaN(Number(p)))) {
    return null;
  }
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

function size(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function TimeField({
  label,
  icon,
  value,
  onCommit,
  onSetHere,
  hereLabel,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  onCommit: (t: number) => void;
  onSetHere: () => void;
  hereLabel: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-row">
        <input
          className="input mono"
          dir="ltr"
          inputMode="decimal"
          aria-label={label}
          value={text ?? fmt(value)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const t = text === null ? null : parseTime(text);
            if (t !== null) onCommit(t);
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <button
          type="button"
          className="btn btn-icon"
          onClick={onSetHere}
          title={hereLabel}
          aria-label={hereLabel}
        >
          {icon}
        </button>
      </div>
    </div>
  );
}

export default function Cutter() {
  const abortRef = useRef<AbortController | null>(null);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [isAudio, setIsAudio] = useState(false);
  const [duration, setDuration] = useState(0);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [mode, setMode] = useState<Mode>("fast");
  const [targetMB, setTargetMB] = useState(16);
  const [volume, setVolume] = useState(1);
  const lastVolume = useRef(1);
  const graphRef = useRef<{
    ctx: AudioContext;
    gain: GainNode;
    el: HTMLMediaElement;
  } | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engine, setEngine] = useState<EngineKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [caps, setCaps] = useState({ webcodecs: false, threads: false, share: false });

  useEffect(() => {
    // Browser capabilities are only known on the client.
    const id = requestAnimationFrame(() =>
      setCaps({
        webcodecs: canUseWebCodecs(),
        threads: canUseThreads(),
        share: typeof navigator !== "undefined" && "canShare" in navigator,
      }),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const onPick = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!/^(video|audio)\//.test(f.type)) {
      setError("نوع الملف غير مدعوم. اختر ملف فيديو أو صوت.");
      return;
    }
    const audio = f.type.startsWith("audio/");
    setFile(f);
    setIsAudio(audio);
    setUrl(URL.createObjectURL(f));
    setResult(null);
    setError("");
    setProgress(0);
    setDuration(0);
    setCurrent(0);
    setDims({ w: 0, h: 0 });
    setMode((m) => (m === "audio" && audio ? "fast" : m));
    // Warm up the engine while the user picks the range
    preloadEngine()
      .then(() => setEngineReady(true))
      .catch(() => {});
  }, []);

  // Drop anywhere on the page
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!busy) onPick(e.dataTransfer?.files?.[0]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [busy, onPick]);

  // Stop preview at the out point
  useEffect(() => {
    if (!previewing) return;
    const m = mediaRef.current;
    if (m && m.currentTime >= end) {
      m.pause();
      setPreviewing(false);
    }
  }, [current, end, previewing]);

  /**
   * Route the player through a Web Audio gain node so preview volume can go
   * above 100%. Must be created after a user gesture; one per media element.
   */
  function ensureGraph() {
    const m = mediaRef.current;
    if (!m) return null;
    const g = graphRef.current;
    if (g && g.el === m) {
      void g.ctx.resume();
      return g;
    }
    if (g) void g.ctx.close();
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      ctx.createMediaElementSource(m).connect(gain).connect(ctx.destination);
      gain.gain.value = volume;
      m.volume = 1;
      graphRef.current = { ctx, gain, el: m };
      void ctx.resume();
      return graphRef.current;
    } catch {
      graphRef.current = null;
      return null;
    }
  }

  function applyVolume(v: number) {
    const clamped = Math.max(0, Math.min(3, v));
    setVolume(clamped);
    setResult(null);
    if (clamped > 0) lastVolume.current = clamped;
    const g = ensureGraph();
    if (g) g.gain.gain.setTargetAtTime(clamped, g.ctx.currentTime, 0.02);
    else if (mediaRef.current) mediaRef.current.volume = Math.min(1, clamped);
  }

  useEffect(() => {
    return () => {
      void graphRef.current?.ctx.close();
      graphRef.current = null;
    };
  }, []);

  function reset() {
    void graphRef.current?.ctx.close();
    graphRef.current = null;
    setFile(null);
    setUrl("");
    setResult(null);
    setError("");
    setProgress(0);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setCurrent(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onMeta() {
    const m = mediaRef.current;
    const d = m?.duration ?? 0;
    const ok = isFinite(d) ? d : 0;
    setDuration(ok);
    setStart(0);
    setEnd(ok);
    setDims({ w: m?.videoWidth ?? 0, h: m?.videoHeight ?? 0 });
  }

  function seek(t: number) {
    if (mediaRef.current) mediaRef.current.currentTime = t;
    setCurrent(t);
  }

  function setRange(s: number, e: number) {
    const ns = Math.max(0, Math.min(s, duration));
    const ne = Math.max(0, Math.min(e, duration));
    if (ns !== start) seek(ns);
    else if (ne !== end) seek(ne);
    setStart(ns);
    setEnd(ne);
    setResult(null);
  }

  const commitStart = (t: number) =>
    setRange(Math.min(t, Math.max(0, end - 0.1)), end);
  const commitEnd = (t: number) =>
    setRange(start, Math.max(t, Math.min(duration, start + 0.1)));

  function togglePlay() {
    const m = mediaRef.current;
    if (!m) return;
    setPreviewing(false);
    ensureGraph();
    if (m.paused) void m.play();
    else m.pause();
  }

  function preview() {
    const m = mediaRef.current;
    if (!m) return;
    m.currentTime = start;
    setPreviewing(true);
    ensureGraph();
    void m.play();
  }

  // Keyboard shortcuts: Space play, I set in, O set out
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [role=slider], button")) return;
      const now = mediaRef.current?.currentTime ?? 0;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "KeyI") {
        commitStart(now);
      } else if (e.code === "KeyO") {
        commitEnd(now);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sel = Math.max(0, end - start);
  const sourcePart = file && duration > 0 ? (file.size * sel) / duration : 0;
  const targetBytes = Math.max(1, targetMB) * MB;
  const plan = planCompress(targetBytes, sel, isAudio, dims.w, dims.h);
  const alreadySmall = mode === "compress" && sourcePart > 0 && sourcePart <= targetBytes;

  const estimate =
    !file || duration <= 0
      ? 0
      : mode === "compress"
        ? Math.min(targetBytes, sourcePart || targetBytes)
        : mode === "audio" || (mode === "precise" && isAudio)
          ? sel * MP3_BYTES_PER_SEC
          : sourcePart;
  const tooBig = estimate > MAX_OUTPUT;
  const compressBlocked = mode === "compress" && !plan.ok;

  function cancel() {
    abortRef.current?.abort();
    setEngineReady(false);
  }

  async function cut() {
    if (!file || sel <= 0 || tooBig || compressBlocked) return;
    mediaRef.current?.pause();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setResult(null);
    setError("");
    setProgress(0);
    setEngine(null);
    setPhase("تجهيز المحرك…");

    const dot = file.name.lastIndexOf(".");
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    const ext =
      dot > 0 ? file.name.slice(dot + 1).toLowerCase() : isAudio ? "mp3" : "mp4";

    try {
      const out = await runJob({
        file,
        ext,
        isAudio,
        start,
        end,
        mode,
        targetBytes,
        srcWidth: dims.w,
        srcHeight: dims.h,
        volume,
        signal: ctrl.signal,
        onProgress: (p) => setProgress(Math.min(1, Math.max(0, p))),
        onEngine: (e) => {
          setEngine(e);
          setPhase(mode === "compress" ? "جاري الضغط…" : "جاري القص…");
        },
      });
      const blob = new Blob([out.data], { type: out.mime });
      const suffix =
        mode === "audio" ? "audio" : mode === "compress" ? `${targetMB}mb` : "cut";
      setResult({
        url: URL.createObjectURL(blob),
        blob,
        name: `${base}-${suffix}.${out.ext}`,
        bytes: blob.size,
        engine: out.engine,
      });
      setProgress(1);
      setEngineReady(true);
    } catch (e) {
      if (!(e instanceof JobAborted)) {
        console.error(e);
        setError(
          mode === "fast"
            ? "فشل القص السريع. جرّب الوضع الدقيق."
            : "فشلت العملية. قد يكون الملف تالفاً أو بصيغة غير مدعومة.",
        );
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setPhase("");
    }
  }

  async function share() {
    if (!result) return;
    const f = new File([result.blob], result.name, { type: result.blob.type });
    try {
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: result.name });
      } else {
        setError("المشاركة غير مدعومة في هذا المتصفح. استخدم زر التنزيل.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError("تعذّرت المشاركة. استخدم زر التنزيل.");
      }
    }
  }

  const overlay = dragging && (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-box">
        <UploadCloud size={48} strokeWidth={1.5} />
        <strong>أفلت الملف هنا</strong>
        <span>فيديو أو صوت، بأي حجم</span>
      </div>
    </div>
  );

  if (!file) {
    return (
      <>
        {overlay}
        <label className="dropzone">
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <span className="dz-icon">
            <UploadCloud size={34} strokeWidth={1.6} />
          </span>
          <strong className="dz-title">اسحب ملفك وأفلته هنا</strong>
          <span className="dz-sub">أو اضغط لاختيار ملف من جهازك</span>
          <span className="btn btn-primary dz-btn">
            <UploadCloud size={18} />
            اختيار ملف
          </span>
          <span className="dz-formats" dir="ltr">
            MP4 · MOV · WEBM · MKV · MP3 · WAV · M4A · OGG
          </span>
        </label>
        {error && (
          <p className="alert alert-error">
            <AlertTriangle size={18} />
            {error}
          </p>
        )}
      </>
    );
  }

  const FileIcon = isAudio ? FileAudio : FileVideo;
  const pctDone = Math.round(progress * 100);

  const modes: {
    id: Mode;
    icon: React.ReactNode;
    title: string;
    desc: string;
    hidden?: boolean;
  }[] = [
    {
      id: "fast",
      icon: <Gauge size={18} />,
      title: "سريع",
      desc: "نفس الصيغة والجودة الأصلية. فوري حتى مع الملفات الضخمة.",
    },
    {
      id: "precise",
      icon: <Sparkles size={18} />,
      title: `دقيق · ${isAudio ? "MP3" : "MP4"}`,
      desc: "قص دقيق على مستوى الإطار. يعيد الترميز.",
    },
    {
      id: "compress",
      icon: <Minimize2 size={18} />,
      title: "ضغط لحجم محدد",
      desc: "قص وضغط ليناسب حد واتساب أو ديسكورد.",
    },
    {
      id: "audio",
      icon: <Music2 size={18} />,
      title: "استخراج الصوت · MP3",
      desc: "يحفظ صوت المقطع فقط بجودة 192kbps.",
      hidden: isAudio,
    },
  ];

  const encodes = mode === "precise" || mode === "compress";
  const plannedEngine: EngineKind =
    encodes && !isAudio && caps.webcodecs
      ? "webcodecs"
      : encodes && !isAudio && caps.threads
        ? "ffmpeg-mt"
        : "ffmpeg";

  return (
    <>
      {overlay}
      <div className="editor">
        <section className="panel stage">
          <header className="file-bar">
            <span className="file-icon">
              <FileIcon size={20} />
            </span>
            <div className="file-meta">
              <strong title={file.name}>{file.name}</strong>
              <span dir="ltr">
                {size(file.size)} · {fmt(duration)}
                {dims.h > 0 && ` · ${dims.w}×${dims.h}`}
              </span>
            </div>
            <span
              className={`engine ${engineReady ? "ready" : ""}`}
              title={engineReady ? "المحرك جاهز" : "جاري تجهيز المحرك"}
            >
              <Cpu size={14} />
              <span className="hide-sm">{engineReady ? "جاهز" : "تجهيز…"}</span>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={reset}
              disabled={busy}
              aria-label="إغلاق الملف"
            >
              <X size={16} />
              <span className="hide-sm">إغلاق</span>
            </button>
          </header>

          <div className={isAudio ? "player-wrap audio" : "player-wrap"}>
            {isAudio && (
              <div className="audio-art">
                <Music2 size={36} strokeWidth={1.6} />
              </div>
            )}
            <video
              ref={mediaRef}
              src={url}
              playsInline
              preload="metadata"
              onLoadedMetadata={onMeta}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={togglePlay}
              className="player"
            />
            {!playing && !isAudio && duration > 0 && (
              <button
                type="button"
                className="big-play"
                onClick={togglePlay}
                aria-label="تشغيل"
              >
                <Play size={28} fill="currentColor" />
              </button>
            )}
          </div>

          <div className="transport">
            <button
              type="button"
              className="btn btn-play"
              onClick={togglePlay}
              aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
            >
              {playing ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </button>
            <span className="clock mono" dir="ltr">
              {fmt(current)} <em>/ {fmt(duration)}</em>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={preview}
              disabled={duration <= 0}
            >
              <Repeat size={16} />
              <span>معاينة</span>
            </button>
          </div>

          <div className="volume">
            <button
              type="button"
              className="btn btn-ghost btn-icon vol-mute"
              onClick={() => applyVolume(volume === 0 ? lastVolume.current : 0)}
              aria-label={volume === 0 ? "إلغاء الكتم" : "كتم الصوت"}
              title={volume === 0 ? "إلغاء الكتم" : "كتم الصوت"}
            >
              {volume === 0 ? (
                <VolumeX size={18} />
              ) : volume < 0.6 ? (
                <Volume1 size={18} />
              ) : (
                <Volume2 size={18} />
              )}
            </button>
            <div className="vol-slider" dir="ltr">
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={volume}
                aria-label="مستوى الصوت"
                onChange={(e) => applyVolume(Number(e.target.value))}
                style={
                  {
                    "--fill": `${(volume / 3) * 100}%`,
                    "--mark": `${(1 / 3) * 100}%`,
                  } as React.CSSProperties
                }
                className={volume > 1 ? "boost" : ""}
              />
            </div>
            <span className={`vol-value mono ${volume > 1 ? "boost" : ""}`} dir="ltr">
              {Math.round(volume * 100)}%
            </span>
            <div className="vol-presets">
              {[0.5, 1, 1.5].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`chip-sm ${Math.abs(volume - v) < 0.01 ? "active" : ""}`}
                  onClick={() => applyVolume(v)}
                  dir="ltr"
                >
                  {v * 100}%
                </button>
              ))}
            </div>
          </div>

          {duration > 0 ? (
            <Timeline
              key={url}
              url={url}
              file={file}
              isAudio={isAudio}
              duration={duration}
              start={start}
              end={end}
              current={current}
              onRange={setRange}
              onSeek={seek}
            />
          ) : (
            <div className="tl-loading">
              <Loader2 size={18} className="spin" />
              قراءة الملف…
            </div>
          )}

          <p className="hint hide-touch">
            <kbd>Space</kbd> تشغيل · <kbd>I</kbd> البداية · <kbd>O</kbd> النهاية
            · <kbd>←</kbd>
            <kbd>→</kbd> تحريك المقبض
          </p>
        </section>

        <aside className="panel side">
          <h2 className="panel-title">
            <Scissors size={18} />
            إعدادات القص
          </h2>

          <div className="fields">
            <TimeField
              label="البداية"
              icon={<ArrowRightToLine size={18} />}
              value={start}
              onCommit={commitStart}
              onSetHere={() => commitStart(mediaRef.current?.currentTime ?? 0)}
              hereLabel="ضع البداية عند الموضع الحالي"
            />
            <TimeField
              label="النهاية"
              icon={<ArrowLeftToLine size={18} />}
              value={end}
              onCommit={commitEnd}
              onSetHere={() => commitEnd(mediaRef.current?.currentTime ?? 0)}
              hereLabel="ضع النهاية عند الموضع الحالي"
            />
          </div>

          <div className="stats">
            <div>
              <span>المدة</span>
              <strong className="mono" dir="ltr">
                {fmt(sel)}
              </strong>
            </div>
            <div>
              <span>{mode === "compress" ? "الحجم الأقصى" : "الحجم التقريبي"}</span>
              <strong className="mono" dir="ltr">
                {mode === "compress" ? "≤ " : mode === "precise" && !isAudio ? "≈ " : ""}
                {size(estimate)}
              </strong>
            </div>
          </div>

          <div className="field">
            <span className="field-label">طريقة التصدير</span>
            <div className="options" role="radiogroup">
              {modes
                .filter((m) => !m.hidden)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    className={`option ${mode === m.id ? "active" : ""}`}
                    onClick={() => {
                      setMode(m.id);
                      setResult(null);
                    }}
                    disabled={busy}
                  >
                    <span className="option-icon">{m.icon}</span>
                    <span className="option-text">
                      <strong>{m.title}</strong>
                      <span>{m.desc}</span>
                    </span>
                    <span className="option-dot" />
                  </button>
                ))}
            </div>
          </div>

          {mode === "compress" && (
            <div className="field compress">
              <span className="field-label">الحجم المستهدف</span>
              <div className="chips">
                {PRESETS.map((p) => (
                  <button
                    key={p.mb}
                    type="button"
                    className={`chip ${targetMB === p.mb ? "active" : ""}`}
                    onClick={() => {
                      setTargetMB(p.mb);
                      setResult(null);
                    }}
                    disabled={busy}
                  >
                    <strong dir="ltr">{p.label}</strong>
                    <span>{p.hint}</span>
                  </button>
                ))}
              </div>
              <label className="custom-size">
                <span>حجم مخصص</span>
                <span className="custom-size-input">
                  <input
                    className="input mono"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={2000}
                    dir="ltr"
                    value={targetMB}
                    onChange={(e) => {
                      setTargetMB(Math.max(1, Math.min(2000, Number(e.target.value) || 1)));
                      setResult(null);
                    }}
                    disabled={busy}
                  />
                  <em dir="ltr">MB</em>
                </span>
              </label>
              {!compressBlocked && !isAudio && (
                <span className="field-help" dir="rtl">
                  الدقة الناتجة:{" "}
                  <bdi dir="ltr">
                    {plan.height ? `${plan.height}p` : dims.h ? `${dims.h}p (الأصلية)` : "الأصلية"}
                  </bdi>{" "}
                  · معدل الفيديو{" "}
                  <bdi dir="ltr">{Math.round(plan.videoBps / 1000)} kbps</bdi>
                </span>
              )}
            </div>
          )}

          {encodes && !isAudio && (
            <p className="engine-note">
              {plannedEngine === "webcodecs" ? <Zap size={14} /> : <Cpu size={14} />}
              المحرك المتوقع: {ENGINE_LABEL[plannedEngine]}
            </p>
          )}

          {Math.abs(volume - 1) > 0.001 && (
            <p className="alert alert-info">
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              {volume === 0
                ? "الصوت مكتوم: سيُحذف من الملف الناتج."
                : `مستوى الصوت ${Math.round(volume * 100)}% سيُطبَّق على الملف الناتج.`}
              {mode === "fast" && volume > 0 && " الفيديو يبقى بدون إعادة ترميز."}
            </p>
          )}
          {alreadySmall && (
            <p className="alert alert-info">
              <CheckCircle2 size={18} />
              المقطع أصلاً أصغر من {targetMB} MB. الوضع السريع يكفي ويحافظ على
              الجودة.
            </p>
          )}
          {compressBlocked && (
            <p className="alert alert-warn">
              <AlertTriangle size={18} />
              الحجم صغير جداً لهذه المدة. أقل حجم مقبول تقريباً{" "}
              {size(plan.minBytes)}، أو قصّر المقطع.
            </p>
          )}
          {tooBig && (
            <p className="alert alert-warn">
              <HardDrive size={18} />
              المقطع المحدد أكبر من {size(MAX_OUTPUT)}، وهو الحد الذي يتسع له
              المتصفح. قصّر المدة أو اختر &quot;ضغط لحجم محدد&quot;.
            </p>
          )}
          {error && (
            <p className="alert alert-error">
              <AlertTriangle size={18} />
              {error}
            </p>
          )}

          {busy ? (
            <div className="progress-card">
              <div className="progress-top">
                <span>
                  <Loader2 size={16} className="spin" />
                  {phase || "جاري العمل…"}
                </span>
                <strong className="mono">{pctDone}%</strong>
              </div>
              <div className="progress">
                <div style={{ width: `${pctDone}%` }} />
              </div>
              {engine && (
                <span className="engine-used">
                  {engine === "webcodecs" ? <Zap size={13} /> : <Cpu size={13} />}
                  {ENGINE_LABEL[engine]}
                </span>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}>
                <Square size={14} fill="currentColor" />
                إلغاء
              </button>
            </div>
          ) : result ? (
            <div className="result">
              <div className="result-head">
                <CheckCircle2 size={22} />
                <div>
                  <strong>جاهز</strong>
                  <span dir="ltr">
                    {result.name} · {size(result.bytes)}
                  </span>
                </div>
              </div>
              <span className="engine-used">
                {result.engine === "webcodecs" ? <Zap size={13} /> : <Cpu size={13} />}
                {ENGINE_LABEL[result.engine]}
              </span>
              <div className="result-actions">
                <a
                  className="btn btn-primary btn-lg"
                  href={result.url}
                  download={result.name}
                >
                  <Download size={18} />
                  تنزيل
                </a>
                {caps.share && (
                  <button
                    type="button"
                    className="btn btn-lg btn-share"
                    onClick={share}
                  >
                    <Share2 size={18} />
                    مشاركة
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setResult(null)}
              >
                <RefreshCw size={16} />
                قص جزء آخر
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={sel <= 0 || duration <= 0 || tooBig || compressBlocked}
              onClick={cut}
            >
              {mode === "compress" ? <Minimize2 size={18} /> : <Scissors size={18} />}
              {mode === "audio"
                ? "استخراج وتصدير"
                : mode === "compress"
                  ? "قص وضغط"
                  : "قص وتصدير"}
            </button>
          )}
        </aside>
      </div>
    </>
  );
}
