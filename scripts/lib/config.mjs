// Which settings file the scripts read (Node only).
//
//   settings.txt           the profile owner's settings (uploaded from the web editor)
//   default.settings.txt   neutral example, used until a settings.txt exists,
//                          so a fresh copy of the template builds without errors
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSettings, resolve } from "./settings.mjs";

export const SETTINGS_FILES = ["settings.txt", "default.settings.txt"];

/** {file, text} of the first settings file that exists in `root` (text "" if none). */
export function readSettingsFile(root) {
  const file = SETTINGS_FILES.find((f) => existsSync(join(root, f)));
  return { file: file || null, text: file ? readFileSync(join(root, file), "utf8") : "" };
}

/** Resolved settings ({theme, light, layout, modules}) from `root`. */
export const loadConfig = (root) => resolve(parseSettings(readSettingsFile(root).text));
