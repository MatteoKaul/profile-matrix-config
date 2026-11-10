// Self-hosted visitor counter in the profile's dot-matrix style.
//
//   node tools/counter/server.mjs              port 8080, count in tools/counter/count.json
//   PORT=9000 COUNT_FILE=/data/count.json COUNTER_LABEL="PROFILE VIEWS" node tools/counter/server.mjs
//
// Run it from a clone of this repo (it reads settings.txt for colours and
// font) on any machine that is reachable over https, e.g. behind your
// reverse proxy (Caddy, nginx, Traefik, Cloudflare Tunnel). Then set
//   counter.url = https://counter.example.com/counter.svg
// and add "counter" to the layout. Every request to /counter.svg counts as
// one view; GitHub's image proxy is told not to cache it.
//   /counter.svg          count + 1, dark colours
//   /counter.svg?light    count + 1, light colours (for theme.mode = light)
//   /health               "ok", does not count
// No dependencies, no other input is read from the request.
import { createServer } from "node:http";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSettings, renderCounter, resolve } from "../../scripts/render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT) || 8080;
const FILE = process.env.COUNT_FILE || join(ROOT, "tools/counter/count.json");
const LABEL = (process.env.COUNTER_LABEL || "VISITORS").toUpperCase();
if (!/^[A-Z0-9 ]{1,24}$/.test(LABEL)) throw new Error("COUNTER_LABEL: letters, digits and spaces, up to 24");

const cfg = resolve(parseSettings(readFileSync(join(ROOT, "settings.txt"), "utf8")));
const font = JSON.parse(readFileSync(join(ROOT, `fonts/${cfg.theme.font}.json`), "utf8"));
let count = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")).count || 0 : 0;

function save() { // write to a temp file first, so a crash never leaves a broken file
  writeFileSync(`${FILE}.tmp`, JSON.stringify({ count }));
  renameSync(`${FILE}.tmp`, FILE);
}

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method !== "GET") { res.writeHead(405).end(); return; }
  if (url.pathname === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); return; }
  if (url.pathname !== "/counter.svg") { res.writeHead(404).end(); return; }
  count += 1;
  save();
  const theme = url.searchParams.has("light") ? cfg.light : cfg.theme;
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
  }).end(renderCounter(theme, font, count, LABEL));
}).listen(PORT, () => console.log(`counter on :${PORT}, ${count} views so far (${FILE})`));
