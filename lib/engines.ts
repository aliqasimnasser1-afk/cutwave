import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

export type Mode = "fast" | "precise" | "audio" | "compress";
export type EngineKind = "webcodecs" | "ffmpeg-mt" | "ffmpeg";

export type Job = {
  file: File;
  ext: string;
  isAudio: boolean;
  start: number;
  end: number;
  mode: Mode;
  /** Target output size in bytes, for `compress`. */
  targetBytes?: number;
  /** Source display size, used to pick a lower resolution when compressing. */
  srcWidth?: number;
  srcHeight?: number;
  /** Audio gain: 1 = unchanged, 0.5 = half, 2 = double, 0 = mute. */
  volume: number;
  signal: AbortSignal;
  onProgress: (p: number) => void;
  onEngine: (e: EngineKind) => void;
};

export type JobResult = {
  data: Uint8Array<ArrayBuffer>;
  ext: string;
  mime: string;
  engine: EngineKind;
};

export class JobAborted extends Error {
  constructor() {
    super("aborted");
  }
}

class EngineStalled extends Error {
  constructor() {
    super("stalled");
  }
}

/** No progress for this long on the threaded core means it is stuck. */
const STALL_MS = 30_000;

/* ------------------------------------------------------------------ */
/* Compression planning                                                */
/* ------------------------------------------------------------------ */

const MIN_VIDEO_BPS = 150_000;
const SAFETY = 0.92; // leave room for container overhead and rate-control overshoot

export type CompressPlan = {
  ok: boolean;
  videoBps: number;
  audioBps: number;
  height?: number;
  width?: number;
  /** Smallest target that still gives watchable output. */
  minBytes: number;
};

export function planCompress(
  targetBytes: number,
  secs: number,
  isAudio: boolean,
  srcW = 0,
  srcH = 0,
): CompressPlan {
  const total = (targetBytes * 8 * SAFETY) / Math.max(secs, 0.1);
  if (isAudio) {
    const audioBps = Math.min(320_000, Math.max(32_000, total));
    return {
      ok: total >= 32_000,
      videoBps: 0,
      audioBps,
      minBytes: (32_000 * secs) / 8 / SAFETY,
    };
  }
  const audioBps = total < 1_200_000 ? 64_000 : 96_000;
  const videoBps = total - audioBps;
  let height =
    videoBps < 500_000
      ? 360
      : videoBps < 900_000
        ? 480
        : videoBps < 2_000_000
          ? 720
          : videoBps < 4_500_000
            ? 1080
            : 0;
  if (srcH > 0 && (height === 0 || height >= srcH)) height = 0;
  let width: number | undefined;
  if (height && srcW && srcH) {
    width = Math.round((srcW * height) / srcH / 2) * 2;
  }
  return {
    ok: videoBps >= MIN_VIDEO_BPS,
    videoBps: Math.max(videoBps, MIN_VIDEO_BPS),
    audioBps,
    height: height || undefined,
    width,
    minBytes: ((MIN_VIDEO_BPS + 64_000) * secs) / 8 / SAFETY,
  };
}

/* ------------------------------------------------------------------ */
/* FFmpeg (wasm) — single-thread and multi-thread cores                */
/* ------------------------------------------------------------------ */

type CoreKind = "st" | "mt";
type MountType = Parameters<FFmpeg["mount"]>[0];

const cores: Record<CoreKind, Promise<FFmpeg> | null> = { st: null, mt: null };
let onTime: ((t: number) => void) | null = null;
/** Last lines of ffmpeg output, attached to errors for debugging. */
const logTail: string[] = [];

/** Multi-threading needs SharedArrayBuffer, i.e. a cross-origin isolated page. */
export function canUseThreads() {
  return typeof window !== "undefined" && window.crossOriginIsolated === true;
}

export function canUseWebCodecs() {
  return (
    typeof window !== "undefined" &&
    "VideoEncoder" in window &&
    "VideoDecoder" in window &&
    "AudioEncoder" in window
  );
}

function createCore(kind: CoreKind) {
  const ff = new FFmpeg();
  ff.on("log", ({ message }) => {
    logTail.push(message);
    if (logTail.length > 25) logTail.shift();
    const m = /time=(\d+):(\d+):([\d.]+)/.exec(message);
    if (m) onTime?.(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
  });
  const base = kind === "mt" ? "/ffmpeg-mt" : "/ffmpeg";
  const p = (async () => {
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      ...(kind === "mt"
        ? {
            workerURL: await toBlobURL(
              `${base}/ffmpeg-core.worker.js`,
              "text/javascript",
            ),
          }
        : {}),
    });
    return ff;
  })();
  p.catch(() => {
    if (cores[kind] === p) cores[kind] = null;
  });
  return p;
}

function getCore(kind: CoreKind) {
  cores[kind] ??= createCore(kind);
  return cores[kind];
}

function killCore(kind: CoreKind) {
  const p = cores[kind];
  cores[kind] = null;
  p?.then((ff) => ff.terminate()).catch(() => {});
}

/** Warm up the engine that fast cuts use, so the first cut starts instantly. */
export function preloadEngine() {
  return getCore("st").then(() => undefined);
}

export function isEngineLoaded() {
  return cores.st !== null;
}

async function runFfmpeg(job: Job, kind: CoreKind): Promise<JobResult> {
  const engine: EngineKind = kind === "mt" ? "ffmpeg-mt" : "ffmpeg";
  job.onEngine(engine);
  const ff = await getCore(kind);
  if (job.signal.aborted) throw new JobAborted();

  const secs = job.end - job.start;
  logTail.length = 0;
  const mountPoint = "/src";
  const inName = `input.${job.ext}`;
  let mounted = false;
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    killCore(kind);
  };
  job.signal.addEventListener("abort", onAbort, { once: true });
  let lastTick = Date.now();
  let stalled = false;
  onTime = (t) => {
    lastTick = Date.now();
    job.onProgress(Math.min(1, t / secs));
  };
  const watchdog =
    kind === "mt"
      ? setInterval(() => {
          if (Date.now() - lastTick > STALL_MS) {
            stalled = true;
            aborted = true;
            killCore(kind);
          }
        }, 5_000)
      : undefined;

  try {
    // Mount the file instead of copying it into wasm memory:
    // ffmpeg reads only the bytes it needs, straight from disk.
    await ff.createDir(mountPoint).catch(() => {});
    await ff.mount(
      "WORKERFS" as MountType,
      { blobs: [{ name: inName, data: job.file }] },
      mountPoint,
    );
    mounted = true;

    const threads = kind === "mt" ? ["-threads", String(threadCount())] : [];
    const preset = kind === "mt" ? "veryfast" : "ultrafast";
    const args = [
      "-hide_banner",
      "-ss",
      String(job.start),
      "-i",
      `${mountPoint}/${inName}`,
      "-t",
      String(secs),
      ...threads,
    ];
    let ext = job.ext;
    let mime = `${job.isAudio ? "audio" : "video"}/${job.ext}`;

    const mp3 = (bitrate: string) => {
      ext = "mp3";
      mime = "audio/mpeg";
      args.push("-vn", "-c:a", "libmp3lame", "-b:a", bitrate);
    };

    const gain = Math.max(0, job.volume);
    const changeVolume = Math.abs(gain - 1) > 0.001;
    const mute = gain === 0 && !job.isAudio && job.mode !== "audio";

    if (job.mode === "fast") {
      args.push("-map", "0", "-c", "copy", "-avoid_negative_ts", "make_zero");
      // Volume needs decoded audio: keep video untouched, re-encode audio only.
      if (mute) args.push("-an");
      else if (changeVolume) args.push(...audioCodecFor(job.ext));
    } else if (job.mode === "audio") {
      mp3("192k");
    } else if (job.mode === "precise") {
      if (job.isAudio) mp3("192k");
      else {
        ext = "mp4";
        mime = "video/mp4";
        args.push(
          "-c:v", "libx264", "-preset", preset, "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "160k",
          "-movflags", "+faststart",
        );
      }
    } else {
      const plan = planCompress(
        job.targetBytes ?? 0,
        secs,
        job.isAudio,
        job.srcWidth,
        job.srcHeight,
      );
      if (job.isAudio) mp3(`${Math.round(plan.audioBps / 1000)}k`);
      else {
        ext = "mp4";
        mime = "video/mp4";
        const v = Math.round(plan.videoBps / 1000);
        args.push(
          "-c:v", "libx264", "-preset", preset,
          "-b:v", `${v}k`, "-maxrate", `${Math.round(v * 1.15)}k`, "-bufsize", `${v * 2}k`,
          "-pix_fmt", "yuv420p",
          ...(plan.height ? ["-vf", `scale=-2:${plan.height}`] : []),
          "-c:a", "aac", "-b:a", `${Math.round(plan.audioBps / 1000)}k`,
          "-movflags", "+faststart",
        );
      }
    }

    if (mute && job.mode !== "fast") args.push("-an");
    else if (changeVolume && !mute) args.push("-af", `volume=${gain.toFixed(3)}`);

    const output = `out.${ext}`;
    const code = await ff.exec([...args, output]);
    if (stalled) throw new EngineStalled();
    if (aborted) throw new JobAborted();
    if (code !== 0) {
      throw new Error(`ffmpeg exit ${code}\n${logTail.slice(-12).join("\n")}`);
    }
    const data = (await ff.readFile(output)) as Uint8Array<ArrayBuffer>;
    await ff.deleteFile(output).catch(() => {});
    return { data, ext, mime, engine };
  } catch (e) {
    if (stalled) throw new EngineStalled();
    if (aborted || job.signal.aborted) throw new JobAborted();
    // A wasm crash leaves the core unusable; start fresh next time.
    aborted = true;
    killCore(kind);
    throw e;
  } finally {
    clearInterval(watchdog);
    onTime = null;
    job.signal.removeEventListener("abort", onAbort);
    if (mounted && !aborted) await ff.unmount(mountPoint).catch(() => {});
  }
}

/** An audio encoder that fits the given container, for re-encoding audio only. */
function audioCodecFor(ext: string): string[] {
  switch (ext) {
    case "mp3":
      return ["-c:a", "libmp3lame", "-b:a", "192k"];
    case "wav":
      return ["-c:a", "pcm_s16le"];
    case "flac":
      return ["-c:a", "flac"];
    case "webm":
    case "mkv":
    case "ogg":
      // libopus crashes inside ffmpeg.wasm; Vorbis is valid in all three.
      return ["-c:a", "libvorbis", "-q:a", "5"];
    case "opus":
      return ["-c:a", "libopus", "-b:a", "160k"];
    default:
      return ["-c:a", "aac", "-b:a", "192k"];
  }
}

function threadCount() {
  const n = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4;
  return Math.max(2, Math.min(n || 4, 4));
}

/* ------------------------------------------------------------------ */
/* WebCodecs (hardware encoder) via mediabunny                         */
/* ------------------------------------------------------------------ */

async function runWebCodecs(job: Job): Promise<JobResult | null> {
  if (!canUseWebCodecs() || job.isAudio) return null;
  const mb = await import("mediabunny");
  const secs = job.end - job.start;

  const input = new mb.Input({
    source: new mb.BlobSource(job.file),
    formats: mb.ALL_FORMATS,
  });
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  if (!(await mb.canEncodeVideo("avc"))) return null;
  const audioCodec = (await mb.canEncodeAudio("aac")) ? "aac" : "opus";

  let video: import("mediabunny").ConversionVideoOptions;
  let audio: import("mediabunny").ConversionAudioOptions;
  if (job.mode === "compress") {
    const plan = planCompress(
      job.targetBytes ?? 0,
      secs,
      false,
      job.srcWidth,
      job.srcHeight,
    );
    video = {
      codec: "avc",
      forceTranscode: true,
      quality: new mb.Quality({
        bitrate: Math.round(plan.videoBps),
        bitrateMode: "constant",
      }),
      ...(plan.width && plan.height
        ? { width: plan.width, height: plan.height, fit: "contain" as const }
        : {}),
    };
    audio = {
      codec: audioCodec,
      forceTranscode: true,
      quality: new mb.Quality({
        bitrate: Math.round(plan.audioBps),
        bitrateMode: "constant",
      }),
    };
  } else {
    video = { codec: "avc", forceTranscode: true, quality: new mb.Quality("high") };
    audio = {
      codec: audioCodec,
      forceTranscode: true,
      quality: new mb.Quality("high"),
    };
  }

  const gain = Math.max(0, job.volume);
  if (gain === 0) {
    audio = { discard: true };
  } else if (Math.abs(gain - 1) > 0.001) {
    const AudioSample = mb.AudioSample;
    audio.process = (sample) => {
      const ch = sample.numberOfChannels;
      const n = sample.numberOfFrames;
      const data = new Float32Array(ch * n);
      for (let c = 0; c < ch; c++) {
        sample.copyTo(data.subarray(c * n, (c + 1) * n), {
          planeIndex: c,
          format: "f32-planar",
        });
      }
      for (let i = 0; i < data.length; i++) {
        const v = data[i] * gain;
        data[i] = v > 1 ? 1 : v < -1 ? -1 : v;
      }
      const out = new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: ch,
        sampleRate: sample.sampleRate,
        timestamp: sample.timestamp,
      });
      sample.close();
      return out;
    };
  }

  const conversion = await mb.Conversion.init({
    input,
    output,
    trim: { start: job.start, end: job.end },
    video,
    audio,
    showWarnings: false,
  });

  const lostVideo = conversion.discardedTracks.some((d) => d.track.type === "video");
  if (!conversion.isValid || lostVideo) return null;

  job.onEngine("webcodecs");
  conversion.onProgress = (p) => job.onProgress(p);
  const onAbort = () => void conversion.cancel();
  job.signal.addEventListener("abort", onAbort, { once: true });
  try {
    await conversion.execute();
  } catch (e) {
    if (job.signal.aborted) throw new JobAborted();
    throw e;
  } finally {
    job.signal.removeEventListener("abort", onAbort);
  }
  if (!target.buffer) throw new Error("empty output");
  return {
    data: new Uint8Array(target.buffer),
    ext: "mp4",
    mime: "video/mp4",
    engine: "webcodecs",
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function runJob(job: Job): Promise<JobResult> {
  const encodes = job.mode === "precise" || job.mode === "compress";
  if (encodes && !job.isAudio) {
    try {
      const r = await runWebCodecs(job);
      // Some hardware encoders ignore the requested bitrate; if the result
      // misses the size target, redo it with x264, which honours it.
      const overshoot =
        r && job.mode === "compress" && r.data.byteLength > (job.targetBytes ?? Infinity);
      if (r && !overshoot) return r;
      if (overshoot) console.warn("WebCodecs output over target, retrying with FFmpeg");
    } catch (e) {
      if (e instanceof JobAborted || job.signal.aborted) throw new JobAborted();
      console.warn("WebCodecs failed, falling back to FFmpeg", e);
    }
    job.onProgress(0);
    if (canUseThreads()) {
      try {
        return await runFfmpeg(job, "mt");
      } catch (e) {
        if (!(e instanceof EngineStalled)) throw e;
        console.warn("Threaded FFmpeg stalled, retrying single-threaded");
        job.onProgress(0);
      }
    }
    return runFfmpeg(job, "st");
  }
  return runFfmpeg(job, "st");
}
