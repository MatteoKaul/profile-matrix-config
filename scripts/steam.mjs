// Fetch public Steam owned games and update daily playtime snapshots in
// data/steam.json (Module 3: Steam Profile Integration).
//
//   STEAM_API_KEY=... STEAM_ID64=... node scripts/steam.mjs
//
// Requirements:
//   - Target Steam profile and "Game details" must be set to Public.
//   - STEAM_API_KEY must be stored as a GitHub Repository Secret.
//   - SteamID64 can be set in settings.txt (`steam.steam_id`) or via STEAM_ID64 secret.
//
// Because Steam's IPlayerService/GetOwnedGames only returns `playtime_forever`
// and `playtime_2weeks`, this script records a lightweight daily snapshot of
// `playtime_forever` so exact deltas for Last Week (7d) and Last Month (30d)
// can be calculated.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { updateSteamSnapshots } from "./lib/sources.mjs";
import { loadConfig } from "./lib/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data/steam.json");
const { STEAM_API_KEY: apiKey, STEAM_ID64: envSteamId } = process.env;

const cfg = loadConfig(ROOT);
const modules = cfg.modules.filter((m) => m.type === "steam");

if (!modules.length) {
  console.log("steam: no steam module configured, skipped");
  process.exit(0);
}

const steamId = modules.map((m) => m.opt.steam_id.trim()).find(Boolean) || (envSteamId || "").trim();
if (!apiKey || !steamId) {
  console.log("steam: STEAM_API_KEY secret or steam_id not set, skipped");
  process.exit(0);
}
if (!/^\d{17}$/.test(steamId)) {
  throw new Error(`steam: invalid SteamID64 "${steamId}" (must be a 17-digit number)`);
}

const params = new URLSearchParams({
  key: apiKey,
  steamid: steamId,
  include_appinfo: "1",
  include_played_free_games: "1",
  format: "json",
});

const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${params}`;
const res = await fetch(url, { headers: { "User-Agent": "profile-matrix" } });
if (!res.ok) throw new Error(`Steam Web API: ${res.status} ${await res.text()}`);

const payload = await res.json();
const apiGames = payload?.response?.games || [];
if (!apiGames.length) {
  console.warn("steam: Steam API returned 0 games (ensure profile and Game Details are set to Public)");
}

const existing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { games: [], snapshots: [] };
const updated = updateSteamSnapshots(existing, apiGames);

mkdirSync(dirname(FILE), { recursive: true });
const text = JSON.stringify(updated, null, 1) + "\n";
const before = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
if (text !== before) writeFileSync(FILE, text);
console.log(`steam: ${updated.games.length} played games, ${updated.snapshots.length} daily snapshots`);
