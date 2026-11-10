// Fast checks before a release (and locally: node tools/check.mjs).
//   1. every .mjs/.js file parses
//   2. the exported template builds README.md from default.settings.txt
//   3. the same with sample data for every module type (all modules shown)
//   4. the site export contains what the editor loads
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
const run = (args, cwd = ROOT) => {
  const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) { failed = true; console.error(`FAIL node ${args.join(" ")}\n${r.stdout}${r.stderr}`); }
  return r;
};
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.(m?js)$/.test(f) ? [p] : [];
});

for (const f of ["scripts", "editor", "tools"].flatMap((d) => files(join(ROOT, d)))) run(["--check", f]);

const tmp = mkdtempSync(join(tmpdir(), "pm-check-"));
try {
  const tpl = join(tmp, "template");
  run(["tools/export.mjs", "template", tpl, "0.0.0-check"]);
  run(["scripts/build.mjs"], tpl);
  if (!existsSync(join(tpl, "README.md")) || !readFileSync(join(tpl, "README.md"), "utf8").includes("assets/gen/")) {
    failed = true; console.error("FAIL template build did not write a generated README.md");
  }
  // Every module type once, with sample data.
  const { TYPES } = await import(join(ROOT, "scripts/render.mjs"));
  const ids = Object.keys(TYPES).map((t) => `m_${t}`);
  writeFileSync(join(tpl, "settings.txt"), [`layout = ${ids.join(", ")}`, ...Object.keys(TYPES).map((t) => `m_${t}.type = ${t}`)].join("\n"));
  run(["scripts/build.mjs", "--sample"], tpl);

  const site = join(tmp, "site");
  run(["tools/export.mjs", "site", site, "0.0.0-check"]);
  for (const p of ["index.html", "editor/index.html", "editor/editor.js", "scripts/render.mjs", "scripts/icons.json", "fonts/led.json", "default.settings.txt", "version.json"]) {
    if (!existsSync(join(site, p))) { failed = true; console.error(`FAIL site export misses ${p}`); }
  }
  for (const p of ["settings.txt", "data", "template", "tools"]) {
    if (existsSync(join(site, p))) { failed = true; console.error(`FAIL site export must not contain ${p}`); }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? "checks failed" : "all checks passed");
process.exit(failed ? 1 : 0);
