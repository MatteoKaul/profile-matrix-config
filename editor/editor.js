// Graphical editor for settings.txt with a live preview.
//
// Open it through a web server, because it loads the repo files next to it:
//   GitHub Pages (Settings -> Pages -> Deploy from branch main, / (root)),
//   then https://<user>.github.io/<repo>/editor/
//   or locally:  python3 -m http.server   ->  http://localhost:8000/editor/
//
// It never writes to the repo itself: download or copy the new settings.txt
// and commit it (the "Edit on GitHub" button opens the file in GitHub's editor).
// The preview uses scripts/render.mjs, the same code the workflow runs.
import * as R from "../scripts/render.mjs";

const $ = (sel) => document.querySelector(sel);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  return fill(el, ...children);
};
/** Replace an element's children; nested arrays and null are allowed. */
const fill = (el, ...children) => {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
};
const svgUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

// The editor's own headings are dot-matrix text from the same renderer.
const UI_THEME = { ...R.resolve({}).theme, fg: "#ffffff" };
const dotImg = (text, pitch, fill = "#ffffff") => state.fonts.led
  ? h("img", { src: svgUrl(R.renderLabel(UI_THEME, state.fonts.led, text, { pitch, fill })), alt: text })
  : text;
const title = (text) => h("h2", {}, dotImg(text, 1.6, "#9a9a9a"));

// Colour presets for the theme panel (dark palette; light mode has its own colours).
const PRESETS = {
  Mono: { fg: "#ffffff", muted: "#cfcfcf", faint: "#7a7a7a", dim: "#2c2c2c", bg: "#000000", border: "#2a2a2a" },
  Purple: { fg: "#b877ff", muted: "#985ce0", faint: "#663c99", dim: "#231436", bg: "#07030d", border: "#321c4d" },
  Amber: { fg: "#ffb000", muted: "#d99a1e", faint: "#8a6420", dim: "#2e2410", bg: "#0a0700", border: "#3a2c10" },
  Phosphor: { fg: "#39ff6a", muted: "#2fcf58", faint: "#1f7a37", dim: "#0f2a16", bg: "#020a04", border: "#123a1c" },
  Ice: { fg: "#9fe8ff", muted: "#7cc4dc", faint: "#4a7686", dim: "#14262e", bg: "#02080b", border: "#1a3440" },
  Red: { fg: "#ff3b30", muted: "#d9453c", faint: "#86302a", dim: "#2e1210", bg: "#0a0202", border: "#3a1612" },
  Grey: { fg: "#d6d6d6", muted: "#a8a8a8", faint: "#6a6a6a", dim: "#262626", bg: "#121212", border: "#303030" },
};

const FONT_LABELS = {
  led: "LED Matrix (Classic 5×7 / 7×9)",
  micro: "Micro Matrix (Compact 3×5 / 5×7)",
  inter: "Inter (Modern Geometric Sans)",
  roboto: "Roboto (Neo-Grotesque Sans)",
  jetbrains: "JetBrains Mono (Developer Monospace)",
  sans: "System Sans-Serif",
  theme: "Use Theme Font Family",
};

const SINGLE_GROUP_LABELS = {
  keep: "Keep as separate category (Standard)",
  more: 'Dissolve into "More" (Option 1)',
  hide: "Hide single-icon categories (Option 2)",
};

/** Parse hex ("#rrggbb" or "#rgb") or "rgb(r, g, b)" into standard "#rrggbb" hex. */
function normalizeColorInput(str) {
  const s = String(str).trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) {
    return s.length === 4 ? "#" + [...s.slice(1)].map((c) => c + c).join("").toLowerCase() : s.toLowerCase();
  }
  const m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i) || s.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (m) {
    const hex = [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, "0")).join("");
    return `#${hex}`;
  }
  return s;
}

const SPEED_PRESETS = [
  ["Slow (0.5x)", 0.5],
  ["Normal (1.0x)", 1.0],
  ["Fast (1.5x)", 1.5],
  ["Turbo (2.5x)", 2.5],
];

const EMPTY_DATA = {
  followers: 0, recentFollowers: [], commits: 0, pinned: [],
  calendar: { total: 0, weeks: [] }, repos: [], contributed: [],
};
const state = {
  settings: {},        // flat settings.txt content, the single source of truth
  catalog: null, fonts: {}, images: {}, githubData: EMPTY_DATA,
  selected: "theme",   // "theme" or a module id
  iconFilter: "", iconCategory: "",
  // Ephemeral in-memory Euro/Dollar input buffer for Zero-Knowledge Portfolio conversion
  // (NEVER written to state.settings, localStorage, or exported files)
  ephemeralAmounts: {},
};

// ------------------------------------------------------------------ load --

async function load() {
  const get = (path) => fetch(path).then((r) => (r.ok ? r : Promise.reject(new Error(`${path}: ${r.status}`))));
  state.catalog = await get("../scripts/icons.json").then((r) => r.json());
  const rawSettings = await get("../settings.txt").then((r) => r.text())
    .catch(() => get("../default.settings.txt").then((r) => r.text())); // hosted editor / fresh template
  state.settings = R.parseSettings(rawSettings);
  const json = (path, fallback) => get(path).then((r) => r.json()).catch(() => fallback);
  state.githubData = {
    ...await json("../data/github.json", EMPTY_DATA),
    feeds: await json("../data/feeds.json", {}),
    live: await json("../data/live.json", {}),
    portfolio: await json("../data/portfolio.json", R.SAMPLE_DATA.portfolio),
    steam: await json("../data/steam.json", R.SAMPLE_DATA.steam),
  };
  if (!state.githubData.repos?.length) $("#dataSource").value = "sample"; // nothing fetched yet: show a filled example
  await Promise.all(R.FONTS.map((f) => font(f).catch(() => null)));
  fill($(".brand"), dotImg("PROFILE EDITOR", 2.4));
  setupGithubLink();
  json("../version.json", null).then((v) => v && ($("#version").textContent = `v${v.version}`));
  renderAll();
}

async function font(name) {
  state.fonts[name] ??= await fetch(`../fonts/${name}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`fonts/${name}.json not found`))));
  return state.fonts[name];
}

/** A repo file (banner background, logo, avatar, thumbnail) for the preview; missing ones stay missing. */
async function image(path) {
  if (path in state.images) return;
  state.images[path] = null; // also remembers "not found"
  const res = await fetch(`../${path}`);
  if (res.ok) setImage(path, new Uint8Array(await res.arrayBuffer()));
}

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function setImage(path, bytes) {
  try { state.images[path] = { ...R.imageSize(bytes), base64: toBase64(bytes) }; } catch { state.images[path] = null; }
}

// ---------------------------------------------------------------- helpers --

let lastValid = R.resolve({});
function cfg() {
  try { lastValid = R.resolve(state.settings); } catch { /* reported by renderPreview */ }
  return lastValid;
}
const layoutIds = () => cfg().layout.map((m) => m.id);
function setLayout(ids) { state.settings.layout = ids.join(", "); changed(); }
function set(key, value) {
  if (value === "" || value == null) delete state.settings[key]; else state.settings[key] = String(value);
  if (key.endsWith(".font")) {
    const prefix = key.slice(0, -5);
    const effectiveFont = value === "theme" ? (state.settings["theme.font"] || "led") : value;
    if (R.MATRIX_FONTS.includes(effectiveFont)) {
      state.settings[`${prefix}.style`] = "led";
    }
    changed();
    renderOptions();
    return;
  }
  changed();
}
let timer;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(renderPreview, 120);
}
function renderAll() { renderModules(); renderOptions(); renderPreview(); }

// ---------------------------------------------------------- module list --

function renderModules() {
  const c = cfg(), shown = new Set(c.layout.map((m) => m.id));
  const item = (m) => {
    const on = shown.has(m.id);
    const el = h("div", { class: `mod${state.selected === m.id ? " sel" : ""}${on ? "" : " off"}`, draggable: on, "data-id": m.id,
      onclick: (e) => { if (e.target.type !== "checkbox") { state.selected = m.id; renderModules(); renderOptions(); } } },
      h("span", { class: "grip", title: "Drag to reorder" }, on ? "⋮⋮" : ""),
      h("input", { type: "checkbox", checked: on, title: on ? "Hide" : "Show",
        onchange: (e) => { setLayout(e.target.checked ? [...layoutIds(), m.id] : layoutIds().filter((i) => i !== m.id)); renderModules(); } }),
      h("span", { class: "name", title: m.id }, m.id),
      h("span", { class: "type", title: R.TYPES[m.type].label }, R.TYPES[m.type].label));
    if (on) dragSort(el, m.id);
    return el;
  };
  const hidden = c.modules.filter((m) => !shown.has(m.id));
  const typeSelect = h("select", {}, Object.entries(R.TYPES).map(([t, d]) => h("option", { value: t }, d.label)));
  fill($("#modules"),
    title("Style"),
    h("div", { class: `mod${state.selected === "theme" ? " sel" : ""}`, onclick: () => { state.selected = "theme"; renderModules(); renderOptions(); } },
      h("span", { class: "name" }, "Theme"), h("span", { class: "type" }, "colours, speed, font")),
    title("Layout (drag to reorder)"),
    c.layout.map(item),
    hidden.length ? [title("Hidden"), hidden.map(item)] : null,
    h("div", { class: "add" }, typeSelect, h("button", { onclick: () => addModule(typeSelect.value) }, "+ Add")));
}

/** HTML5 drag and drop between module rows. */
function dragSort(el, id) {
  el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/module", id));
  el.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/module")) { e.preventDefault(); el.classList.add("dragover"); } });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const from = e.dataTransfer.getData("text/module");
    const ids = layoutIds().filter((i) => i !== from);
    ids.splice(ids.indexOf(id), 0, from);
    setLayout(ids);
    renderModules();
  });
}

function addModule(type) {
  const ids = cfg().modules.map((m) => m.id);
  let id = type, k = 2;
  while (ids.includes(id)) id = `${type}${k++}`;
  if (id !== type) state.settings[`${id}.type`] = type;
  state.selected = id;
  setLayout([...layoutIds(), id]);
  renderModules(); renderOptions();
}

function deleteModule(id) {
  for (const key of Object.keys(state.settings)) if (key.startsWith(`${id}.`)) delete state.settings[key];
  state.selected = "theme";
  setLayout(layoutIds().filter((i) => i !== id));
  renderModules(); renderOptions();
}

// ------------------------------------------------------ secrets guide --

// Profiles are created from this template; the guide links it.
const TEMPLATE_URL = "https://github.com/MatteoKaul/profile-matrix";
const ext = (href, text) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);

/** Step-by-step guide for the given secret names (all of them in the dialog). */
function secretsGuide(names) {
  const rows = names.map((n) => [n, R.SECRETS[n]]);
  return [
    h("p", { class: "guide-lead" },
      "Secrets are stored in your own profile repository (created from ", ext(TEMPLATE_URL, "profile-matrix"),
      "), not on this website. This editor never asks for a key and never stores one."),
    h("table", { class: "secret-table" },
      h("tr", {}, h("th", {}, "Name"), h("th", {}, "Needed"), h("th", {}, "Value / where to get it")),
      rows.map(([n, s]) => h("tr", {},
        h("td", {}, h("code", {}, n)),
        h("td", {}, s.need),
        h("td", {}, s.what, s.get ? [" - ", ext(s.get, new URL(s.get).hostname)] : null,
          s.get2 ? [" / ", ext(s.get2, new URL(s.get2).hostname)] : null)))),
    h("ol", { class: "steps" },
      h("li", {}, "Open your profile repository on github.com and click ", h("strong", {}, "Settings"),
        " (top tab; on small screens behind the \u2026 menu). You need admin access to the repository."),
      h("li", {}, "In the sidebar under ", h("em", {}, "Security"), ": ", h("strong", {}, "Secrets and variables"),
        " \u2192 ", h("strong", {}, "Actions"), "."),
      h("li", {}, "On the ", h("strong", {}, "Secrets"), " tab click ", h("strong", {}, "New repository secret"),
        " (not an environment secret)."),
      h("li", {}, h("strong", {}, "Name"), ": exactly as in the table, e.g. ", h("code", {}, names[0]), ". ",
        h("strong", {}, "Secret"), ": paste only the value, without quotes, spaces or a ", h("code", {}, "NAME="), " prefix."),
      h("li", {}, "Click ", h("strong", {}, "Add secret"),
        ". GitHub never shows the value again; to change it, open the secret and click ", h("strong", {}, "Update"), "."),
      h("li", {}, "Test it: ", h("strong", {}, "Actions"), " tab \u2192 ", h("strong", {}, "Update profile"), " \u2192 ",
        h("strong", {}, "Run workflow"), ". A step that logs \u201cnot set, skipped\u201d means the name does not match.")),
    h("ul", { class: "guide-rules" },
      h("li", {}, "Never put a key into settings.txt, an issue, a commit or a screenshot: the repository is public."),
      h("li", {}, "Secrets are not copied to forks or repositories created from the template; every repository needs its own."),
      h("li", {}, "Key leaked? Revoke it at the provider and create a new one. Deleting the commit is not enough, the history keeps it.")),
  ];
}

/** Always-visible box on modules that read a secret; the steps fold out. */
function secretWarningBox(warning) {
  if (!warning) return null;
  return h("div", { class: "secret-warning", role: "note" },
    h("strong", {}, "REPOSITORY SECRET - NEVER PUT KEYS IN SETTINGS.TXT"),
    h("div", {}, "Store ", warning.secrets.map((s, i) => [i ? " and " : "", h("code", {}, s)]),
      " as repository secret", warning.secrets.length > 1 ? "s" : "", " in your profile repository. ", warning.text),
    h("details", {}, h("summary", {}, "How to add a repository secret"), secretsGuide(warning.secrets)));
}

// --------------------------------------------------------------- options --

function renderOptions() {
  const c = cfg();
  if (state.selected === "theme") {
    const curFg = state.settings["theme.fg"] ?? c.theme.fg;
    const fgPick = h("input", { type: "color", value: curFg.slice(0, 7) });
    const fgHex = h("input", { type: "text", value: curFg, placeholder: "#rrggbb or rgb(r,g,b)", title: "Hex (#rrggbb) or RGB (r, g, b)" });
    const applyCustomFontColor = (raw) => {
      const hex = normalizeColorInput(raw);
      fgHex.value = hex;
      if (/^#[0-9a-f]{6}$/i.test(hex)) fgPick.value = hex;
      set("theme.fg", hex);
    };
    fgPick.oninput = () => applyCustomFontColor(fgPick.value);
    fgHex.onchange = () => applyCustomFontColor(fgHex.value);

    fill($("#options"), title("Theme & Typography"),
      h("div", { class: "field" }, h("label", {}, "Colour presets"),
        h("div", { class: "presets" }, Object.entries(PRESETS).map(([name, colours]) =>
          h("button", { title: "Sets the theme colours below", style: `--a:${colours.fg};--b:${colours.bg}`,
            onclick: () => { for (const [k, v] of Object.entries(colours)) state.settings[`theme.${k}`] = v; changed(); renderOptions(); } },
          h("i", {}), name))),
        h("div", { class: "help" }, "Starting points (Mono, Purple, Amber, Phosphor, Ice, Red, Grey); every colour can be customized below.")),
      h("div", { class: "field" },
        h("label", {}, "Font colour (hex or rgb)"),
        h("div", { class: "row" }, fgPick, fgHex),
        h("div", { class: "help" }, "Pick any custom font colour or enter Hex (#b877ff) or RGB (184, 119, 255).")),
      R.THEME_FIELDS.map((f) => field(f, state.settings[`theme.${f.key}`] ?? c.theme[f.key], (v) => set(`theme.${f.key}`, v))));
    return;
  }
  const m = c.modules.find((x) => x.id === state.selected);
  if (!m) { state.selected = "theme"; return renderOptions(); }
  const typeDef = R.TYPES[m.type];
  fill($("#options"),
    title(`${m.id} - ${typeDef.label}`),
    h("p", { class: "help" }, typeDef.help),
    secretWarningBox(typeDef.secretWarning),
    typeDef.fields.map((f) => field(f, m.opt[f.key], (v) => set(`${m.id}.${f.key}`, v), m)),
    m.type === "banner" ? imageUpload(m) : null,
    h("button", { class: "danger", onclick: () => confirm(`Delete module "${m.id}" and its options?`) && deleteModule(m.id) }, "Delete module"));
}

/** One option row; the editor widget depends on the field type. */
function field(f, value, onChange, module) {
  let input;
  switch (f.type) {
    case "number": {
      const range = h("input", { type: "range", min: f.min, max: f.max, step: f.step, value });
      const num = h("input", { type: "number", min: f.min, max: f.max, step: f.step, value });
      const setVal = (v) => { range.value = v; num.value = v; onChange(v); };
      range.oninput = () => setVal(range.value);
      num.oninput = () => setVal(num.value);
      const presets = f.key === "animation_speed"
        ? h("div", { class: "presets" }, SPEED_PRESETS.map(([lbl, v]) =>
          h("button", { type: "button", onclick: () => setVal(v) }, lbl)))
        : null;
      input = h("div", {}, h("div", { class: "row" }, range, num), presets);
      break;
    }
    case "color": {
      // auto colours (outline_color) show what auto means right now; picking a colour makes it manual
      const autoHex = () => { const t = cfg().theme; return R.outlineAutoHex(t.fg, t.bg); };
      const isAuto = f.auto && (value === "auto" || value == null || value === "");
      const pick = h("input", { type: "color", value: isAuto ? autoHex() : String(value).slice(0, 7) });
      const txt = h("input", { type: "text", value: isAuto ? "auto" : value, placeholder: f.auto ? "auto or #rrggbb" : "#rrggbb or rgb(r,g,b)" });
      pick.oninput = () => { txt.value = pick.value; onChange(pick.value); };
      if (f.auto) {
        const reset = h("button", { type: "button", title: "Follow the font colour again", onclick: () => {
          txt.value = "auto"; pick.value = autoHex(); onChange("auto");
        } }, "Auto");
        txt.onchange = () => {
          if (txt.value.trim().toLowerCase() === "auto" || !txt.value.trim()) { txt.value = "auto"; pick.value = autoHex(); onChange("auto"); return; }
          const hex = normalizeColorInput(txt.value);
          txt.value = hex;
          if (/^#[0-9a-f]{6}$/i.test(hex)) pick.value = hex;
          onChange(hex);
        };
        input = h("div", { class: "row" }, pick, txt, reset);
        break;
      }
      txt.onchange = () => {
        const hex = normalizeColorInput(txt.value);
        txt.value = hex;
        if (/^#[0-9a-f]{6}$/i.test(hex)) pick.value = hex;
        onChange(hex);
      };
      input = h("div", { class: "row" }, pick, txt);
      break;
    }
    case "select":
      input = h("select", { onchange: (e) => { onChange(e.target.value); if (["icons", "portfolio"].includes(module?.type)) renderOptions(); } },
        f.options.map((o) => h("option", { value: o, selected: o === value },
          f.key === "dissolve_single" ? (SINGLE_GROUP_LABELS[o] || o) : o)));
      break;
    case "name": // font selector with dropdown + custom input support
      if (f.suggest && f.suggest.length) {
        input = h("select", { onchange: (e) => onChange(e.target.value) },
          f.suggest.map((o) => h("option", { value: o, selected: o === value }, FONT_LABELS[o] || o)));
      } else {
        input = h("input", { type: "text", value, oninput: (e) => onChange(e.target.value) });
      }
      break;
    case "toggle": // on/off switch
      input = h("label", { class: "switch" },
        h("input", { type: "checkbox", checked: value === "on", onchange: (e) => onChange(e.target.checked ? "on" : "off") }),
        h("span", {}, value === "on" ? "on" : "off"));
      input.querySelector("input").addEventListener("change", (e) => (input.querySelector("span").textContent = e.target.checked ? "on" : "off"));
      break;
    case "textarea":
      input = h("textarea", { oninput: (e) => onChange(e.target.value) }, value);
      break;
    case "icons":
      return iconEditor(module);
    case "links":
      return linkEditor(f, value, onChange);
    case "people":
      return peopleEditor(f, value, onChange);
    case "rows":
      return linesEditor(f, value, onChange);
    case "portfolio":
      return portfolioEditor(f, value, onChange, module);
    default:
      input = h("input", { type: "text", value, oninput: (e) => onChange(e.target.value) });
  }
  return h("div", { class: "field" }, h("label", {}, f.label), input, f.help ? h("div", { class: "help" }, f.help) : null);
}

// ------------------------------------ Zero-Knowledge Portfolio Input UI --

/**
 * Module 2: Zero-Knowledge Portfolio Editor.
 * Users enter their current position amounts in €/$ in the browser.
 * The tool immediately converts those amounts into relative percentage weights
 * client-side. The absolute €/$ numbers live only in memory while typing and
 * are NEVER stored in settings.txt, localStorage, or pushed to the repository.
 */
function portfolioEditor(f, value, onChange, module) {
  const modKey = module?.id || "portfolio";
  state.ephemeralAmounts[modKey] ??= {};
  const amounts = state.ephemeralAmounts[modKey];

  // Parse current percentage allocations from settings
  const parsed = R.splitPairs(value).map(([ticker, rest]) => {
    const [wStr = "0", label = ""] = rest.split("|").map((s) => s.trim());
    const weight = Math.max(0, Number(wStr.replace(/%$/, "")) || 0);
    return { ticker: ticker.toUpperCase(), weight, label, amount: amounts[ticker.toUpperCase()] ?? "" };
  });
  const rows = parsed.length ? parsed : [
    { ticker: "VWCE.DE", weight: 60, label: "FTSE ALL-WORLD", amount: "" },
    { ticker: "AAPL", weight: 25, label: "APPLE", amount: "" },
    { ticker: "BTC-USD", weight: 15, label: "BITCOIN", amount: "" },
  ];

  const list = h("div", {});

  const step = Number(module?.opt?.precision) || R.PORTFOLIO_SAFE_STEP;
  const riskBox = h("div", {});

  // Only the rounded weights are saved; amounts stay in this function's memory.
  const saveWeights = () => {
    const useAmounts = rows.some((r) => Number(r.amount) > 0);
    const rounded = R.roundWeights(rows.map((r) => Number(useAmounts ? r.amount : r.weight) || 0), step);
    rows.forEach((r, i) => { r.weight = rounded[i]; });
    const serialized = rows
      .filter((r) => r.ticker.trim() && r.weight > 0)
      .map((r) => `${r.ticker.trim().toUpperCase()}=${r.weight}${r.label.trim() ? `|${r.label.trim()}` : ""}`)
      .join(", ");
    drawRisk();
    onChange(serialized);
  };

  // Always-visible privacy note; turns into a warning above the threshold.
  const drawRisk = () => {
    const risk = R.portfolioRisk(rows.filter((r) => r.ticker.trim() && r.weight > 0).length, step);
    fill(riskBox, h("div", { class: `zk-risk ${risk.level}`, role: "note" },
      h("strong", {}, risk.level === "not-recommended" ? "NOT RECOMMENDED: " + risk.reason.toUpperCase()
        : risk.level === "caution" ? "CAUTION: " + risk.reason.toUpperCase() : "WHAT BECOMES PUBLIC"),
      h("div", {}, "Only the weights are published (in settings.txt, rounded to ", h("code", {}, `${step} %`),
        "), never amounts. But weights plus the public prices on the day you commit them show the ratio between your positions. ",
        "With few whole shares of expensive stocks, someone could guess how many shares you hold."),
      h("div", {}, risk.level === "not-recommended"
        ? `Use a precision of ${R.PORTFOLIO_SAFE_STEP} % or coarser (option below). Finer steps are only safe for large portfolios or fractional savings plans.`
        : `Keep the precision at ${R.PORTFOLIO_SAFE_STEP} % or coarser. Many positions and fractional shares make guessing harder.`)));
  };

  const draw = () => {
    fill(list, rows.map((row, i) => {
      const weightDisplay = h("span", { class: "zk-weight", title: "Saved percentage weight" }, `${row.weight}%`);
      const amountInput = h("input", {
        type: "number", min: 0, step: "any", value: row.amount, autocomplete: "off", inputmode: "decimal",
        placeholder: "Amount (EUR/USD)",
        title: "Position value: converted to a rounded % at once, never saved or exported",
        oninput: (e) => {
          row.amount = e.target.value;
          amounts[row.ticker] = row.amount;
          saveWeights();
          // Update all weight displays live without losing focus
          list.querySelectorAll(".zk-weight").forEach((el, idx) => {
            if (rows[idx]) el.textContent = `${rows[idx].weight}%`;
          });
        },
      });
      return h("div", { class: "entry-row", style: "--cols:4" },
        h("input", { type: "text", value: row.ticker, placeholder: "Ticker (e.g. VWCE.DE)",
          oninput: (e) => { row.ticker = e.target.value.toUpperCase(); saveWeights(); } }),
        h("input", { type: "text", value: row.label, placeholder: "Label (e.g. World ETF)",
          oninput: (e) => { row.label = e.target.value; saveWeights(); } }),
        amountInput,
        weightDisplay,
        h("button", { title: "Remove asset", onclick: () => { rows.splice(i, 1); saveWeights(); draw(); } }, "×")
      );
    }));
  };
  if (rows.some((r) => Number(r.amount) > 0)) saveWeights(); else drawRisk(); // precision changed: round again
  draw();

  return h("div", { class: "field" },
    h("label", {}, f.label),
    h("div", { class: "zk-box" },
      h("div", { class: "zk-badge" }, "ZERO-KNOWLEDGE: AMOUNTS ARE CONVERTED TO % IN THIS BROWSER AND NEVER SAVED"),
      riskBox,
      list,
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { type: "button", onclick: () => { rows.push({ ticker: "", label: "", amount: "", weight: 0 }); draw(); } }, "+ Add Asset"),
        h("button", { type: "button", onclick: () => {
          rows.forEach((r) => { r.amount = ""; });
          state.ephemeralAmounts[modKey] = {};
          draw();
        } }, "Clear amounts (keep %)")
      )
    ),
    h("div", { class: "help" }, f.help)
  );
}

function imageUpload(m) {
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const name = f.name.replace(/[^\w.-]/g, "_");
      try { // videos are converted by build.mjs; the preview shows their first frame
        setImage(R.mediaPath(name), R.isVideo(name) ? await videoFrame(f) : new Uint8Array(await f.arrayBuffer()));
      } catch (err) {
        $("#status").className = "status error";
        $("#status").textContent = `${f.name}: ${err.message} (the workflow can still convert it)`;
        return;
      }
      set(`${m.id}.image`, name);
      renderOptions();
    } });
  return h("div", { class: "field" }, h("label", {}, "Try another background"), file,
    h("div", { class: "help" }, "Preview only: to use it, add the file to assets/src/ in the repo. " +
      "GIFs and animated WebPs play here; videos show their first frame (the workflow converts them)."));
}

/** First frame of a video file as PNG bytes. */
async function videoFrame(file) {
  const video = h("video", { muted: true, playsinline: true, src: URL.createObjectURL(file) });
  await new Promise((ok, err) => { video.onloadeddata = ok; video.onerror = () => err(new Error("this browser cannot decode the video")); });
  video.currentTime = Math.min(0.2, video.duration / 2); // frame 0 is often still empty
  await new Promise((ok) => { video.onseeked = ok; });
  const canvas = h("canvas", { width: video.videoWidth, height: video.videoHeight });
  canvas.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Row editor used for socials, people, now and timeline: each row is a few text/select
 * columns, saved back into the single-line settings format by `save`.
 */
function rowEditor(f, rows, columns, save, blank, addLabel, wide = columns.length > 3) {
  const list = h("div", {});
  const draw = () => fill(list, rows.map((row, i) => h("div", { class: `entry-row${wide ? " wide" : ""}`, style: `--cols:${columns.length}` },
    columns.map((col, c) => col.options
      ? h("select", { title: col.label, onchange: (e) => { row[c] = e.target.value; save(); } },
        col.options.map((o) => h("option", { value: o, selected: o === row[c] }, o)))
      : h("input", { type: "text", value: row[c], placeholder: col.label, title: col.label,
        oninput: (e) => { row[c] = e.target.value; save(); } })),
    h("button", { title: "Remove", onclick: () => { rows.splice(i, 1); save(); draw(); } }, "×"))));
  draw();
  return h("div", { class: "field" }, h("label", {}, f.label), list,
    h("button", { onclick: () => { rows.push([...blank]); draw(); } }, addLabel),
    h("div", { class: "help" }, f.help));
}

/** socials: icon, url and an optional label (icon=url|LABEL). */
function linkEditor(f, value, onChange) {
  const rows = R.splitPairs(value).map(([k, v]) => [k, ...v.split("|").map((x) => x.trim())]).map(([k, u = "", l = ""]) => [k, u, l]);
  const save = () => onChange(rows.filter(([k]) => k).map(([k, u, l]) => `${k}=${u}${l ? `|${l}` : ""}`).join(", "));
  const keys = Object.keys(state.catalog.icons).sort((a, b) =>
    (state.catalog.icons[b].category === "social") - (state.catalog.icons[a].category === "social") || a.localeCompare(b));
  return rowEditor(f, rows, [{ label: "icon", options: keys }, { label: "https://..." }, { label: "label (optional)" }],
    save, ["website", "", ""], "+ Link");
}

/** people: name, role, url, image (gh:<login> or icon key). */
function peopleEditor(f, value, onChange) {
  const rows = R.splitPeople(value).map((e) => [e.name, e.role, e.url, e.image]);
  const save = () => onChange(rows.filter(([n]) => n).map((r) => r.join(" | ")).join(", "));
  return rowEditor(f, rows, [{ label: "Name" }, { label: "Role" }, { label: "https://..." }, { label: "gh:login, file:logo.png or icon" }],
    save, ["", "", "", ""], "+ Entry");
}

/** rows fields (now, timeline, spoken): one entry per line, columns separated by "|". */
function linesEditor(f, value, onChange) {
  const rows = R.splitRows(value, f.columns.length);
  const save = () => onChange(rows.filter((r) => r.some(Boolean)).map((r) => r.join(" | ")).join("\n"));
  return rowEditor(f, rows, f.columns.map((label) => ({ label })), save, f.columns.map(() => ""), "+ Line", f.columns.length > 2);
}

// ----------------------------------------------------------- icon editor --
// Enabled icons are shown per category (the same grouping the README uses).
// Drag chips to reorder; dropping into another category writes a "move"
// override. Category arrows write "order", the title box writes "titles".
// Clicking "2x" on a chip toggles manual double-width for that icon; in
// granular continuity mode each category also has a column-span selector.

function iconEditor(m) {
  const { catalog } = state, o = m.opt, key = (k) => `${m.id}.${k}`;
  const items = R.splitList(o.items);
  const move = Object.fromEntries(R.splitPairs(o.move));
  const titles = Object.fromEntries(R.splitPairs(o.titles));
  const doubleItems = new Set(R.splitList(o.double_items || "").map((x) => x.toLowerCase()));
  const colSpans = Object.fromEntries(R.splitPairs(o.col_spans || ""));
  const groups = R.iconGroups({ ...o, dissolve_single: "keep" }, catalog);
  const catOf = (k) => move[k] || catalog.icons[k].category;

  const saveItems = (list) => set(key("items"), list.join(", "));
  const saveMove = () => set(key("move"), Object.entries(move).map(([k, c]) => `${k}=${c}`).join(", "));
  const saveTitles = () => set(key("titles"), Object.entries(titles).filter(([, t]) => t).map(([c, t]) => `${c}=${t}`).join(", "));
  const saveDoubles = () => {
    const list = [...doubleItems];
    set(key("double_items"), list.join(", "));
    if (list.length && o.double_mode === "off") set(key("double_mode"), "manual");
  };
  const saveSpans = () => set(key("col_spans"), Object.entries(colSpans).filter(([, v]) => Number(v) > 1).map(([c, v]) => `${c}=${v}`).join(", "));
  const refresh = () => { renderOptions(); };

  function dropChip(target, cat, beforeKey) {
    return (e) => {
      e.preventDefault(); target.classList.remove("dragover");
      const k = e.dataTransfer.getData("text/icon");
      if (!k) return;
      if (catalog.icons[k].category === cat) delete move[k]; else move[k] = cat;
      const list = items.filter((x) => x !== k);
      let at = beforeKey ? list.indexOf(beforeKey) : -1;
      if (at < 0) {
        const last = list.map(catOf).lastIndexOf(cat);
        at = last < 0 ? list.length : last + 1;
      }
      list.splice(at, 0, k);
      state.settings[key("items")] = list.join(", ");
      saveMove(); refresh();
    };
  }
  const allowDrop = (el) => (e) => { if (e.dataTransfer.types.includes("text/icon")) { e.preventDefault(); el.classList.add("dragover"); } };

  const moveCat = (cat, dir) => {
    const order = groups.map(([c]) => c), i = order.indexOf(cat), j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set(key("order"), order.join(", ")); refresh();
  };

  state.extraCats = (state.extraCats || []).filter((c) => !groups.some(([g]) => g === c));
  const shown = [...groups, ...state.extraCats.map((c) => [c, []])];

  const boxes = shown.map(([cat, keys]) => {
    const spanControl = o.continuity === "granular" && o.columns > 1
      ? h("select", { class: "span-select", title: "Column width span (Granular Mode)",
        onchange: (e) => { colSpans[cat] = e.target.value; saveSpans(); refresh(); } },
        Array.from({ length: o.columns }, (_, idx) => {
          const w = String(idx + 1);
          return h("option", { value: w, selected: (colSpans[cat] || "1") === w }, `${w} col`);
        }))
      : null;

    const box = h("div", { class: "cat" },
      h("div", { class: "cat-head" },
        h("button", { class: "icon-btn", title: "Move category up", onclick: () => moveCat(cat, -1) }, "↑"),
        h("button", { class: "icon-btn", title: "Move category down", onclick: () => moveCat(cat, 1) }, "↓"),
        h("input", { type: "text", value: titles[cat] || catalog.categories[cat] || cat.toUpperCase(), title: "Heading shown in the README",
          onchange: (e) => { titles[cat] = e.target.value === catalog.categories[cat] ? "" : e.target.value; saveTitles(); } }),
        spanControl,
        h("small", {}, keys.length === 1 && o.dissolve_single === "more" ? `${cat} (→ More)` : keys.length === 1 && o.dissolve_single === "hide" ? `${cat} (hidden)` : cat)),
      h("div", { class: "chips" }, keys.length ? keys.map((k) => {
        const is2x = doubleItems.has(k);
        const chip = h("span", { class: `chip${move[k] ? " moved" : ""}${is2x ? " double" : ""}`, draggable: true,
          title: move[k] ? `moved here from ${catalog.icons[k].category}` : `drag to reorder or move` },
          k,
          h("button", { class: is2x ? "on" : "", title: "Toggle 2x double width",
            onclick: () => { if (is2x) doubleItems.delete(k); else doubleItems.add(k); saveDoubles(); refresh(); } }, "2x"),
          h("button", { title: "Remove", onclick: () => { delete move[k]; doubleItems.delete(k); saveMove(); saveDoubles(); saveItems(items.filter((x) => x !== k)); refresh(); } }, "×"));
        chip.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/icon", k));
        chip.addEventListener("dragover", allowDrop(chip));
        chip.addEventListener("dragleave", () => chip.classList.remove("dragover"));
        chip.addEventListener("drop", (e) => { e.stopPropagation(); dropChip(chip, cat, k)(e); });
        return chip;
      }) : h("span", { class: "help" }, "Drop icons here")));
    box.addEventListener("dragover", allowDrop(box));
    box.addEventListener("dragleave", () => box.classList.remove("dragover"));
    box.addEventListener("drop", dropChip(box, cat));
    return box;
  });

  const unused = Object.keys(catalog.categories).filter((c) => !shown.some(([s]) => s === c));
  const addCat = h("select", { onchange: (e) => { state.extraCats.push(e.target.value); refresh(); } },
    h("option", { value: "" }, "+ Category as drop target…"), unused.map((c) => h("option", { value: c }, catalog.categories[c])));

  // Catalog picker: click an icon to show / hide it.
  const theme = cfg().theme, fontData = state.fonts[theme.font];
  const search = h("input", { type: "text", placeholder: "Search icons…", value: state.iconFilter,
    oninput: (e) => { state.iconFilter = e.target.value; drawPicker(); } });
  const catSelect = h("select", { onchange: (e) => { state.iconCategory = e.target.value; drawPicker(); } },
    h("option", { value: "" }, "All categories"),
    Object.entries(catalog.categories).map(([c, t]) => h("option", { value: c, selected: c === state.iconCategory }, t)));
  const picker = h("div", { class: "picker" });
  function drawPicker() {
    const q = state.iconFilter.toLowerCase();
    fill(picker, Object.entries(catalog.icons)
      .filter(([k, ic]) => (!state.iconCategory || ic.category === state.iconCategory) &&
        (!q || k.includes(q) || ic.label.toLowerCase().includes(q)))
      .map(([k, ic]) => h("button", { class: `pick${items.includes(k) ? " on" : ""}`, title: `${k} (${catalog.categories[ic.category]})`,
        onclick: () => { saveItems(items.includes(k) ? items.filter((x) => x !== k) : [...items, k]); refresh(); } },
        h("img", { src: svgUrl(R.renderTile(theme, fontData, ic)), alt: ic.label, loading: "lazy" }))));
  }
  drawPicker();

  // All simple options; items / move / order / titles / double_items / col_spans are edited visually below.
  const style = R.TYPES.icons.fields.filter((f) => !["items", "move", "order", "titles", "double_items", "col_spans"].includes(f.key))
    .map((f) => field(f, o[f.key], (v) => set(key(f.key), v), m));

  return h("div", {},
    style,
    title("Shown icons by category"),
    h("p", { class: "help" }, "Drag icons to reorder or move between categories. Click '2x' on any icon chip for manual double-width."),
    boxes, unused.length ? addCat : null,
    title("Catalog"),
    h("div", { class: "picker-tools" }, search, catSelect),
    picker);
}

// --------------------------------------------------------------- preview --

/** Tiny Markdown subset for text modules; README HTML passes through. */
function markdown(md) {
  return md.split(/\n{2,}/).map((block) => {
    if (block.trim().startsWith("<")) return block;
    const inline = block
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>").replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/ {2}\n/g, "<br>");
    return `<p>${inline}</p>`;
  }).join("\n");
}

// The README is shown in a sandboxed iframe (no scripts), styled like github.com.
const PREVIEW_CSS = `
  body { margin: 0; padding: 24px; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
  body.dark { background: #0d1117; color: #e6edf3; } body.light { background: #fff; color: #1f2328; }
  .readme { max-width: 830px; margin: 0 auto; border: 1px solid #30363d; border-radius: 6px; padding: 32px; }
  .light .readme { border-color: #d0d7de; }
  p { margin: 0 0 16px; } img { max-width: 100%; vertical-align: middle; } a { color: #4493f8; }
  code { background: rgba(110,118,129,.4); padding: .2em .4em; border-radius: 6px; font-size: 85%; }`;

// Page colour of the preview (dark / light value). Only the preview: github.com always
// shows its own background, which is why card_fill = none exists.
const PREVIEW_PAGES = { github: ["#0d1117", "#ffffff"], dimmed: ["#212830", "#ffffff"], contrast: ["#010409", "#ffffff"] };
function previewBackground(c, light) {
  const choice = $("#previewPage").value;
  const bg = choice === "cards" ? (light ? c.light.bg : c.theme.bg)
    : choice === "custom" ? $("#previewColor").value
    : (PREVIEW_PAGES[choice] || PREVIEW_PAGES.github)[light ? 1 : 0];
  return /^#[0-9a-f]{3,8}$/i.test(bg) ? bg : PREVIEW_PAGES.github[light ? 1 : 0];
}

function showPreview(html, pageBg) {
  const frame = $("#frame"), y = frame.contentWindow?.scrollY || 0;
  frame.style.background = pageBg;
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>${PREVIEW_CSS}</style>` +
    `<body class="${$("#previewMode").value}" style="background:${pageBg}"><article class="readme">${html}</article></body>`;
  frame.onload = () => frame.contentWindow.scrollTo(0, y); // keep the scroll position while editing
}

async function renderPreview() {
  const status = $("#status");
  try {
    const c = R.resolve(state.settings); // throws on invalid values -> shown in the status line
    await Promise.all(R.neededFonts(c).map(font));
    const data = $("#dataSource").value === "sample" ? R.SAMPLE_DATA : state.githubData;
    await Promise.all(R.neededImages(c, data).map(image));
    const images = Object.fromEntries(Object.entries(state.images).filter(([, v]) => v));
    const { files, readme } = R.render(c, data, { fonts: state.fonts, catalog: state.catalog, images });
    const light = $("#previewMode").value === "light";
    const counter = svgUrl(R.renderCounter(light && c.theme.mode !== "dark" ? c.light : c.theme, state.fonts[c.theme.font], 1234));
    const html = markdown(readme.replace(/^<!--.*?-->\n*/s, ""))
      // <picture>: GitHub picks by the viewer's theme, the preview by the Preview setting
      .replace(/<picture><source media="\(prefers-color-scheme: light\)" srcset="([^"]+)" \/>(<img src=")[^"]+("[^>]*>)<\/picture>/g,
        (tag, lightSrc, a, b) => (light ? a + lightSrc + b : tag.replace(/^<picture>.*?\/>|<\/picture>$/g, "")))
      .replace(/src="(assets\/gen\/[^"]+)"/g, (_, path) => `src="${svgUrl(files[path])}"`)
      // external images (the visitor counter) cannot load here: a sample instead
      .replace(/src="https:\/\/[^"]*"/g, `src="${counter}"`);
    showPreview(html, previewBackground(c, light));
    status.className = "status";
    status.textContent = `${Object.keys(files).length} images · ${$("#dataSource").value === "sample" ? "sample data" : "GitHub data"}`;
  } catch (err) {
    status.className = "status error";
    status.textContent = err.message;
  }
}

// ---------------------------------------------------------------- output --

const settingsText = () => R.writeSettings(state.settings, state.catalog);

// The profile repository the visitor uploads settings.txt to. Remembered in
// this browser only (a convenience); on a profile's own Pages site it is that repo.
const REPO_KEY = "profile-matrix.repo";
function setupGithubLink() {
  const input = $("#repoName"), link = $("#uploadToGithub");
  let saved = "";
  try { saved = localStorage.getItem(REPO_KEY) || ""; } catch { /* storage blocked */ }
  if (!saved && location.hostname.endsWith(".github.io")) {
    const owner = location.hostname.split(".")[0], repo = location.pathname.split("/")[1];
    if (repo && repo !== "profile-matrix-config") saved = `${owner}/${repo}`;
  }
  const update = () => {
    const repo = input.value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "");
    const ok = /^[\w.-]+\/[\w.-]+$/.test(repo);
    link.href = ok ? `https://github.com/${repo}/upload/main` : "https://github.com/MatteoKaul/profile-matrix";
    link.textContent = ok ? "Upload to my repo" : "Get the template";
    try { if (ok) localStorage.setItem(REPO_KEY, repo); } catch { /* storage blocked */ }
  };
  input.value = saved;
  input.addEventListener("input", update);
  update();
}

/** Import a dropped or chosen settings.txt. */
async function importSettings(file) {
  if (!file || file.size > 1e6) return;
  state.settings = R.parseSettings(await file.text());
  state.selected = "theme";
  renderAll();
}
document.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
document.addEventListener("drop", (e) => {
  const f = [...(e.dataTransfer?.files || [])].find((x) => /\.txt$/i.test(x.name));
  if (f) { e.preventDefault(); importSettings(f); }
});

fill($("#secretsBody"), secretsGuide(Object.keys(R.SECRETS)));
$("#secretsGuideBtn").onclick = () => $("#secretsDialog").showModal();
$("#closeSecretsBtn").onclick = () => $("#secretsDialog").close();
$("#secretsDialog").onclick = (e) => { if (e.target === $("#secretsDialog")) $("#secretsDialog").close(); };

$("#download").onclick = () => {
  const a = h("a", { href: URL.createObjectURL(new Blob([settingsText()], { type: "text/plain" })), download: "settings.txt" });
  a.click();
};
$("#copy").onclick = async () => {
  await navigator.clipboard.writeText(settingsText());
  $("#copy").textContent = "Copied ✓";
  setTimeout(() => ($("#copy").textContent = "Copy settings.txt"), 1500);
};
$("#importFile").onchange = async (e) => {
  await importSettings(e.target.files[0]);
};
$("#dataSource").onchange = renderPreview;
$("#previewMode").onchange = renderPreview;
// Preview page colour: remembered in this browser only (a convenience, not a setting).
for (const [id, key] of [["#previewPage", "profile-matrix.page"], ["#previewColor", "profile-matrix.pageColor"]]) {
  try { const v = localStorage.getItem(key); if (v) $(id).value = v; } catch { /* storage blocked */ }
  $(id).addEventListener("input", () => {
    try { localStorage.setItem(key, $(id).value); } catch { /* storage blocked */ }
    $("#previewColor").hidden = $("#previewPage").value !== "custom";
    renderPreview();
  });
}
$("#previewColor").hidden = $("#previewPage").value !== "custom";

load().catch((err) => { $("#status").className = "status error"; $("#status").textContent = `Could not load: ${err.message}`; });
