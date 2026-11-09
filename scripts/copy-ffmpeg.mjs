import { cpSync, mkdirSync } from "node:fs";

// Single-thread core: works everywhere.
// Multi-thread core: used when the page is cross-origin isolated
// (COOP/COEP headers, see next.config.ts).
const cores = [
  { src: "node_modules/@ffmpeg/core/dist/umd", dest: "public/ffmpeg", files: ["ffmpeg-core.js", "ffmpeg-core.wasm"] },
  {
    src: "node_modules/@ffmpeg/core-mt/dist/umd",
    dest: "public/ffmpeg-mt",
    files: ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"],
  },
];

for (const { src, dest, files } of cores) {
  mkdirSync(dest, { recursive: true });
  for (const f of files) cpSync(`${src}/${f}`, `${dest}/${f}`);
  console.log("ffmpeg core copied to", dest);
}
