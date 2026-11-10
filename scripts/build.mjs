// Build README.md and all images in assets/gen/ from settings.txt
// (falls back to default.settings.txt until a settings.txt exists).
//
//   node scripts/build.mjs                    use data/ (written by fetch.mjs, live.mjs, market.mjs, steam.mjs)
//   node scripts/build.mjs --sample           use fake data, e.g. to try layouts
//   node scripts/build.mjs --write-settings   also rewrite settings.txt with all
//                                             options and their explanations
//
// Needs Node 18+ only; ffmpeg just for video banners (mp4/webm/mov), which
// are converted once to an animated webp in data/media/. The drawing itself
// is in render.mjs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SAMPLE_DATA, imageSize, isVideo, neededFonts, neededImages, parseSettings, render, resolve, writeSettings,
} from "./render.mjs";
import { readSettingsFile } from "./lib/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = (p) => join(ROOT, p);
const read = (p) => readFileSync(path(p), "utf8");
const readJson = (p, fallback) => (existsSync(path(p)) ? JSON.parse(read(p)) : fallback);
const args = process.argv.slice(2);


// What the repo looks like before the first fetch: no data, everything zero.
const EMPTY_DATA = { followers: 0, recentFollowers: [], commits: 0, pinned: [], calendar: { total: 0, weeks: [] }, repos: [], contributed: [] };

const settings = parseSettings(readSettingsFile(ROOT).text);
const cfg = resolve(settings);
const catalog = JSON.parse(read("scripts/icons.json"));
const fonts = Object.fromEntries(neededFonts(cfg).filter((f) => existsSync(path(`fonts/${f}.json`)))
  .map((f) => [f, JSON.parse(read(`fonts/${f}.json`))]));
const data = args.includes("--sample") ? SAMPLE_DATA : {
  ...readJson("data/github.json", EMPTY_DATA),
  feeds: readJson("data/feeds.json", {}),
  live: readJson("data/live.json", {}),
  portfolio: readJson("data/portfolio.json", { history: [] }),
  steam: readJson("data/steam.json", { games: [], snapshots: [] }),
};

for (const m of cfg.layout) if (m.type === "banner" && isVideo(m.opt.image)) convertVideo(m.opt);
// Conversions no banner module (shown or hidden) refers to any more.
const videos = cfg.modules.filter((m) => m.type === "banner").map((m) => m.opt.image);
for (const f of existsSync(path("data/media")) ? readdirSync(path("data/media")) : []) {
  if (!videos.includes(f.replace(/\.(webp|json)$/, ""))) rmSync(path(`data/media/${f}`));
}

// Images the modules need (backgrounds, logos, avatars, thumbnails), embedded into the SVGs.
const images = {};
for (const p of neededImages(cfg, data)) {
  if (!existsSync(path(p))) continue; // render() reports what is missing
  const bytes = readFileSync(path(p));
  images[p] = { ...imageSize(bytes), base64: bytes.toString("base64") };
}

const { files, readme } = render(cfg, data, { fonts, catalog, images });

// assets/gen only holds generated files, so it is rebuilt from scratch.
rmSync(path("assets/gen"), { recursive: true, force: true });
for (const [p, content] of Object.entries(files)) {
  mkdirSync(dirname(path(p)), { recursive: true });
  writeFileSync(path(p), content);
}
writeFileSync(path("README.md"), readme);
if (args.includes("--write-settings")) writeFileSync(path("settings.txt"), writeSettings(settings, catalog));

const big = Object.entries(files).filter(([, c]) => c.length > 5e6).map(([p]) => p);
if (big.length) console.warn(`warning: over 5 MB, GitHub may load these slowly: ${big.join(", ")} (lower fps / length)`);
console.log(`built README.md and ${Object.keys(files).length} images (${cfg.layout.map((m) => m.id).join(", ")})`);

/**
 * assets/src/<video> -> data/media/<video>.webp (greyscale, 960 px wide,
 * looping). data/media/<video>.json remembers the source hash and options,
 * so the conversion only runs again when something changed.
 */
function convertVideo(opt) {
  const src = `assets/src/${opt.image}`, out = `data/media/${opt.image}.webp`, meta = `data/media/${opt.image}.json`;
  if (!existsSync(path(src))) return; // render() reports it
  const stamp = { sha1: createHash("sha1").update(readFileSync(path(src))).digest("hex"), fps: opt.fps, duration: opt.duration };
  if (existsSync(path(out)) && existsSync(path(meta)) && read(meta) === JSON.stringify(stamp)) return;
  mkdirSync(path("data/media"), { recursive: true });
  const ffmpeg = spawnSync("ffmpeg", ["-v", "error", "-y", "-t", String(opt.duration), "-i", path(src),
    "-vf", `fps=${opt.fps},scale=960:-2:flags=lanczos,format=gray`, "-an",
    "-c:v", "libwebp_anim", "-loop", "0", "-quality", "55", "-compression_level", "6", path(out)], { encoding: "utf8" });
  if (ffmpeg.error || ffmpeg.status !== 0) {
    throw new Error(`banner.image: converting ${src} needs ffmpeg (with libwebp): ${ffmpeg.error?.message || ffmpeg.stderr}`);
  }
  writeFileSync(path(meta), JSON.stringify(stamp));
  console.log(`converted ${src} -> ${out}`);
}
