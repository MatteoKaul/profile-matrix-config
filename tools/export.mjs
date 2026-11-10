// Builds the two published outputs of this repo into an empty directory.
//
//   node tools/export.mjs template <dir> [version]   contents of MatteoKaul/profile-matrix
//   node tools/export.mjs site <dir> [version]       GitHub Pages site (web editor)
//
// template: generator only (scripts, fonts, counter, default settings, workflows,
//           README placeholder). No editor, no personal settings or data.
// site:     editor + the renderer it imports, default settings, version.json.
//           No settings.txt and no data/, so every visitor starts neutral.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [kind, out, version = "dev"] = process.argv.slice(2);
if (!["template", "site"].includes(kind) || !out) {
  console.error("usage: node tools/export.mjs template|site <dir> [version]");
  process.exit(1);
}
if (existsSync(out) && readdirSync(out).some((f) => f !== ".git")) {
  console.error(`${out} is not empty`); // never overwrite files we did not create
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const copy = (from, to = from) => cpSync(join(ROOT, from), join(out, to), { recursive: true });

if (kind === "template") {
  for (const p of ["scripts", "fonts", "default.settings.txt"]) copy(p);
  copy("tools/counter");
  copy("template", "."); // README.md, .gitignore, .github/workflows/*
  writeFileSync(join(out, "VERSION"), `${version}\n`);
} else {
  for (const p of ["editor", "scripts", "fonts", "default.settings.txt"]) copy(p);
  writeFileSync(join(out, "version.json"), JSON.stringify({ version }) + "\n");
  writeFileSync(join(out, ".nojekyll"), "");
  // The editor lives in editor/ (it loads ../scripts, ../fonts); the root forwards to it.
  writeFileSync(join(out, "index.html"),
    '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=editor/">' +
    '<title>profile-matrix config</title><a href="editor/">Open the editor</a>\n');
}
console.log(`${kind} ${version} -> ${out}`);
