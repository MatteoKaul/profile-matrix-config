// For the optional data steps (Steam, market prices, Twitch): a failure must
// never stop the profile build. The step logs a GitHub Actions warning, keeps
// the data from the last good run (it only writes after a full success) and
// exits with 0, so the workflow goes on and rebuilds the README.
//
//   import { optionalStep } from "./lib/optional.mjs";
//   optionalStep("steam");   // first line after the imports
//
// Messages are cut to one short line; URLs are never part of them (the
// scripts do not put request URLs into errors, as those can carry API keys).

export function optionalStep(name) {
  const fail = (err) => {
    const msg = String(err?.message || err).replace(/\s+/g, " ").slice(0, 300);
    console.log(`::warning title=${name} skipped::${name}: ${msg} (previous data kept, profile still built)`);
    process.exit(0);
  };
  process.on("uncaughtException", fail);
  process.on("unhandledRejection", fail);
}
