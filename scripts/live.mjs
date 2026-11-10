// Twitch live status for twitch modules -> data/live.json.
//
//   TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... node scripts/live.mjs
//
// Needs a Twitch application (dev.twitch.tv/console, "Register Your
// Application", any redirect URL) and its id and secret as repository
// secrets. Without them, or without a twitch module, it does nothing.
// data/live.json only changes when a channel goes live or offline (or the
// stream title / game changes), so the workflows only commit then.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { liveState } from "./lib/sources.mjs";
import { loadConfig } from "./lib/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data/live.json");
const { TWITCH_CLIENT_ID: id, TWITCH_CLIENT_SECRET: secret } = process.env;

const cfg = loadConfig(ROOT);
const channels = [...new Set(cfg.modules.filter((m) => m.type === "twitch").map((m) => m.opt.channel.toLowerCase()).filter(Boolean))];
if (!channels.length) { console.log("live: no twitch module"); process.exit(0); }
if (!id || !secret) { console.log("live: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set, skipped"); process.exit(0); }

const auth = await fetch("https://id.twitch.tv/oauth2/token", {
  method: "POST",
  body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
}).then((r) => r.json());
if (!auth.access_token) throw new Error(`Twitch login failed: ${JSON.stringify(auth)}`);

const res = await fetch(`https://api.twitch.tv/helix/streams?${channels.map((c) => `user_login=${encodeURIComponent(c)}`).join("&")}`,
  { headers: { "Client-Id": id, Authorization: `Bearer ${auth.access_token}` } });
if (!res.ok) throw new Error(`Twitch API: ${res.status} ${await res.text()}`);
const state = liveState(channels, (await res.json()).data);

const text = JSON.stringify(state, null, 1) + "\n";
const before = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
mkdirSync(dirname(FILE), { recursive: true });
if (text !== before) writeFileSync(FILE, text);
console.log(`live: ${channels.map((c) => `${c} ${state[c].live ? "LIVE" : "offline"}`).join(", ")}${text === before ? " (unchanged)" : ""}`);
