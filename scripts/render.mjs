// Profile renderer: settings + GitHub data -> SVG images + README.md.
//
// Pure functions only (no file or network access), so the same code runs in
// Node (scripts/build.mjs, used by the workflow) and in the browser
// (editor/), which makes the editor preview identical to the real output.
//
//   lib/settings.mjs   option schema, settings.txt parsing/writing, validation
//   lib/draw.mjs       dot-matrix text and all SVG pieces
//   render.mjs         picks the data for each module and assembles README.md
//
// This file re-exports everything the build script and the editor need.
import {
  CARD_W, activityCard, bannerSvg, categoryRows, codeCard, counterSvg, dividerSvg, esc, feedCard,
  followersCard, guestbookCard, heading, liveCard, nowCard, painter, personCard,
  placeholderCard, portfolioCard, projectCard, releaseCard, spokenCard, statsCard,
  steamCard, tile, timelineCard,
} from "./lib/draw.mjs";
import { MEDIA_FILE, isVideo, splitList, splitPairs, splitPeople, splitPortfolio, splitRows } from "./lib/settings.mjs";

const LINK = /^(https?:\/\/|mailto:)/i; // allowed link targets in the README

export * from "./lib/settings.mjs";
export { imageSize, renderLabel, renderTile } from "./lib/draw.mjs";

/** A visitor counter badge as SVG (tools/counter/server.mjs, editor preview). */
export const renderCounter = (theme, font, count, label) => counterSvg(painter(theme, font), theme, count, label);

// ------------------------------------------------------------- data use --

/** Numbers for the stats card, from data/github.json. */
function statsFrom(data) {
  const own = (data.repos || []).filter((r) => !r.fork);
  const size = {};
  for (const r of own) for (const [lang, bytes] of Object.entries(r.languages || {})) size[lang] = (size[lang] || 0) + bytes;
  const total = Object.values(size).reduce((a, b) => a + b, 0);
  return {
    repos: own.length, stars: own.reduce((a, r) => a + r.stars, 0), commits: data.commits || 0, followers: data.followers || 0,
    languages: Object.entries(size).sort((a, b) => b[1] - a[1]).map(([name, s]) => [name, (100 * s) / total]),
  };
}

function pickRepos(data, opt) {
  const repos = data.repos || [];
  const byName = Object.fromEntries(repos.map((r) => [r.name.toLowerCase(), r]));
  const named = (names) => names.map((x) => byName[x.toLowerCase()]).filter(Boolean);
  const list = opt.mode === "list" ? named(splitList(opt.repos))
    : opt.mode === "recent" ? repos.filter((r) => !r.fork).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt))
    : named(data.pinned || []);
  return list.slice(0, opt.limit);
}

/** Pick external repositories contributed to (Module 4: Projects I Participate In). */
function pickContributed(data, opt) {
  const all = data.contributed || [];
  const exclude = new Set(splitList(opt.exclude || "").map((x) => x.toLowerCase()));
  const filtered = all.filter((r) => !exclude.has(r.name.toLowerCase()) && !exclude.has((r.name.split("/")[1] || "").toLowerCase()));
  if (opt.mode === "list") {
    const byName = Object.fromEntries(filtered.flatMap((r) => [[r.name.toLowerCase(), r], [(r.name.split("/")[1] || r.name).toLowerCase(), r]]));
    return splitList(opt.repos).map((n) => byName[n.toLowerCase()]).filter(Boolean).slice(0, opt.limit);
  }
  return filtered.slice(0, opt.limit);
}

function pickReleases(data, opt) {
  const all = (data.repos || []).filter((r) => r.release)
    .map((r) => ({ repo: r.name, ...r.release }))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (opt.mode === "latest") return all.slice(0, 1);
  if (opt.mode === "list") {
    const by = Object.fromEntries(all.map((r) => [r.repo.toLowerCase(), r]));
    return splitList(opt.repos).map((x) => by[x.toLowerCase()]).filter(Boolean);
  }
  return all.slice(0, opt.limit);
}

/**
 * Filter and sort Steam games according to preset (top5, top10, custom5, custom10)
 * and exclusion filter (by AppID or name, with automatic rank promotion).
 */
export function pickSteamGames(steamData, opt) {
  const games = Array.isArray(steamData?.games) ? steamData.games : [];
  const exclude = splitList(opt.exclude || "").map((s) => s.toLowerCase());
  const isExcluded = (g) => exclude.some((ex) => String(g.appid) === ex || g.name.toLowerCase() === ex || g.name.toLowerCase().includes(ex));
  const pool = games.filter((g) => !isExcluded(g));

  const valOf = (g) => (opt.period === "1w" ? g.week : opt.period === "1m" ? g.month : g.total) || 0;
  const limit = opt.preset.endsWith("10") ? 10 : 5;

  if (opt.preset.startsWith("custom")) {
    const wanted = splitList(opt.custom || "").map((s) => s.toLowerCase());
    const picked = wanted.map((q) => pool.find((g) => String(g.appid) === q || g.name.toLowerCase() === q || g.name.toLowerCase().includes(q))).filter(Boolean);
    return picked.slice(0, limit);
  }
  return [...pool]
    .filter((g) => valOf(g) > 0 || opt.period === "all")
    .sort((a, b) => valOf(b) - valOf(a) || b.total - a.total)
    .slice(0, limit);
}

/**
 * Icons of an icons module grouped into categories: [[category, [keys]]], empty ones dropped.
 * Single-icon group handling (`opt.dissolve_single`):
 *   - "keep" (or legacy "off"): keep single-icon categories as their own group
 *   - "more" (or legacy "on"): dissolve single-icon categories and merge their icons into a combined "more" group
 *   - "hide": hide categories that contain only a single icon
 */
export function iconGroups(opt, catalog) {
  const items = splitList(opt.items).map((k) => k.toLowerCase());
  const unknown = items.filter((k) => !catalog.icons[k]);
  if (unknown.length) throw new Error(`icons: unknown icon(s) ${unknown.join(", ")}`);
  const move = Object.fromEntries(splitPairs(opt.move));
  // category keys become file names (cat-<key>.svg), custom ones are allowed
  const badCat = [...splitList(opt.order), ...Object.values(move)].filter((c) => !/^[\w-]+$/.test(c));
  if (badCat.length) throw new Error(`icons: invalid category name(s) ${badCat.join(", ")}`);
  const order = [...new Set([...splitList(opt.order), ...Object.keys(catalog.categories), ...Object.values(move)])];
  const hidden = new Set(splitList(opt.hidden || "")); // hidden categories: dropped before single-icon groups are merged
  const raw = order.map((cat) => [cat, items.filter((k) => (move[k] || catalog.icons[k].category) === cat)])
    .filter(([cat, keys]) => keys.length && !hidden.has(cat));

  const mode = opt.dissolve_single === "on" ? "more" : opt.dissolve_single === "off" ? "keep" : (opt.dissolve_single || "keep");
  if (mode === "hide") {
    return raw.filter(([, keys]) => keys.length > 1);
  }
  if (mode === "more" && raw.length >= 1) {
    const multi = raw.filter(([, keys]) => keys.length > 1);
    const singles = raw.filter(([, keys]) => keys.length === 1).flatMap(([, keys]) => keys);
    if (singles.length) {
      multi.push(["more", singles]);
      return multi;
    }
  }
  return raw;
}

function pickFeed(data, opt) {
  // "*" only exists in SAMPLE_DATA: sample entries for any source
  const items = splitList(opt.sources).flatMap((src) => data.feeds?.[src] ?? data.feeds?.["*"] ?? []);
  const seen = new Set();
  return items.filter((i) => !seen.has(i.url) && seen.add(i.url))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, opt.limit);
}

/**
 * Repo paths of all images the visible modules need (banner backgrounds,
 * logos, avatars, thumbnails). build.mjs and the editor load these into
 * assets.images; files that do not exist yet are simply left out.
 */
export function neededImages(cfg, data) {
  const paths = new Set();
  for (const m of cfg.layout) {
    const o = m.opt;
    if (m.type === "banner" && o.image !== "none") paths.add(mediaPath(o.image));
    if (m.type === "people") for (const e of splitPeople(o.items)) {
      if (e.image.startsWith("gh:")) paths.add(`data/avatars/${e.image.slice(3)}`);
      if (e.image.startsWith("file:")) paths.add(`assets/src/${e.image.slice(5)}`);
    }
    if (m.type === "feed" && o.thumbs === "on") for (const i of pickFeed(data, o)) if (THUMB.test(i.thumb)) paths.add(i.thumb);
  }
  return [...paths].filter((path) => /^(assets\/src|data\/(avatars|thumbs|media))\/[\w-][\w.-]*$/.test(path));
}

/** Videos are converted to an animated webp in data/media/ (by build.mjs). */
export const mediaPath = (file) => (isVideo(file) ? `data/media/${file}.webp` : `assets/src/${file}`);
const THUMB = /^data\/thumbs\/[0-9a-f]{12}$/;

/** Font names the config uses (theme font, banner fonts). */
export const neededFonts = (cfg) => [...new Set([cfg.theme.font,
  ...cfg.layout.filter((m) => m.type === "banner" && m.opt.font !== "theme").map((m) => m.opt.font)])];

// --------------------------------------------------------------- render --

/**
 * Render everything.
 *   cfg     resolve(settings)
 *   data    data/github.json + feeds + live + portfolio + steam (or SAMPLE_DATA)
 *   assets  {fonts: {name: font}, catalog, images: {repo path: {mime, base64, width, height}}}
 * Returns {files: {path: svg text}, readme: markdown}; all paths are under assets/gen/.
 *
 * theme.mode = auto renders every image twice (light ones in assets/gen/light/)
 * and the README picks one per viewer with <picture>.
 */
export function render(cfg, data, assets) {
  const mode = cfg.theme.mode;
  const main = renderPass(cfg, data, assets, { theme: mode === "light" ? cfg.light : cfg.theme, light: mode === "light", prefix: "" });
  let { readme } = main;
  const files = { ...main.files };
  if (mode === "auto") {
    const alt = renderPass(cfg, data, assets, { theme: cfg.light, light: true, prefix: "light/" });
    readme = readme.replace(/<img src="assets\/gen\/([^"]+)"([^>]*)\/>/g, (tag, path, rest) => {
      const lightPath = `assets/gen/light/${path}`;
      // images that look the same in both modes (e.g. a kept banner) are not duplicated
      if (!alt.files[lightPath] || alt.files[lightPath] === files[`assets/gen/${path}`]) return tag;
      files[lightPath] = alt.files[lightPath];
      return `<picture><source media="(prefers-color-scheme: light)" srcset="${lightPath}" />${tag}</picture>`;
    });
  }
  return { files, readme };
}

function renderPass(cfg, data, assets, { theme, light, prefix }) {
  const { catalog, images = {} } = assets;
  const fontOf = (name) => assets.fonts?.[name] ?? fail(`font "${name}": fonts/${name}.json not found`);
  const p = painter(theme, fontOf(cfg.theme.font));
  const files = {}, blocks = [];
  const put = (path, svg) => { files[`assets/gen/${prefix}${path}`] = svg; return `assets/gen/${path}`; };
  // Optional: assets.hits collects where icons / banner sit in each image, in README order, for the
  // editor's interactive preview. Only the main pass records (the light pass draws the same layout).
  const record = (entry) => { if (assets.hits && !prefix) assets.hits.push(entry); };
  const img = (src, alt, attrs) => `<img src="${src}" alt="${esc(alt)}" ${attrs} />`;
  const link = (url, html) => (url ? `<a href="${esc(url)}">${html}</a>` : html);
  // Wrapped in <p> so GitHub adds the usual paragraph spacing below images.
  const para = (html) => `<p>${html}</p>`;
  const headingBlock = (m, title, small = false, key = "heading", cat = null) => {
    if (!title) return "";
    const src = put(`${m.id}/${key}.svg`, heading(p, theme, title, small));
    if (cat) record({ src, module: m.id, w: CARD_W, h: 0, hits: [{ type: "head", cat, x: 0, y: 0, w: CARD_W, h: 0 }] }); // h 0 = whole image
    return para(img(src, title, 'width="100%"'));
  };
  const join = (...parts) => parts.filter(Boolean).join("\n\n");
  const cardRow = (cards) => `<p>\n${cards.join("\n")}\n</p>`;
  const checkLink = (m, url, what) => {
    if (url && !LINK.test(url)) fail(`${m.id}: ${what} must start with https://, http:// or mailto:`);
  };
  const fullCard = (m, svg, alt, file = "card") => para(img(put(`${m.id}/${file}.svg`, svg), alt, 'width="100%"'));

  for (const m of cfg.layout) {
    const o = m.opt;
    switch (m.type) {
      case "banner": {
        const image = o.image !== "none" ? images[mediaPath(o.image)] : null;
        if (o.image !== "none" && !image) {
          fail(isVideo(o.image) ? `banner.image: ${o.image} is not converted yet (run node scripts/build.mjs with ffmpeg installed)`
            : `banner.image: assets/src/${o.image} not found`);
        }
        // Light mode keeps the dark banner unless banner.light = adapt.
        const adapt = light && o.light === "adapt";
        const t = adapt ? theme : cfg.theme;
        const bStyle = o.style && o.style !== "theme" ? o.style : t.style;
        const svg = bannerSvg(painter(t, fontOf(o.font === "theme" ? cfg.theme.font : o.font), bStyle), t, o, image, adapt);
        blocks.push(`<p align="center">\n  ${img(put(`${m.id}/banner.svg`, svg), o.title || "Banner", 'width="100%"')}\n</p>`);
        break;
      }
      case "text":
        blocks.push(join(headingBlock(m, o.title), o.text.split("\n").join("  \n")));
        break;
      case "icons": {
        const groups = iconGroups(o, catalog)
          .filter(([, keys]) => o.min_toggle !== "on" || keys.length >= o.min_icons);
        const titles = Object.fromEntries(splitPairs(o.titles));
        const titleOf = (cat) => titles[cat] || catalog.categories[cat] || (cat === "more" || cat === "general" ? "MORE" : cat.toUpperCase());
        const doubleSet = new Set(splitList(o.double_items || "").map((k) => k.toLowerCase()));
        const useManualDouble = o.double_mode === "manual" || o.double_mode === "both" || o.continuity === "granular";
        const useAutoDouble = o.double_mode === "auto" || o.double_mode === "both";

        if (o.columns > 1) {
          const rows = categoryRows(
            p,
            theme,
            groups.map(([cat, keys]) => [titleOf(cat), keys.map((k) => ({ ...catalog.icons[k], key: k })), cat]),
            o
          );
          blocks.push(join(o.style === "compact" ? headingBlock(m, o.title) : "",
            ...rows.map((r, i) => {
              const src = put(`${m.id}/row-${i + 1}.svg`, r.svg);
              record({ src, module: m.id, w: r.w, h: r.h, hits: r.hits });
              return para(img(src, r.alt, 'width="100%"'));
            })));
          break;
        }
        // Columns = 1: standalone SVG tiles
        let cat = ""; // category of the tiles being emitted (for the preview's hit map)
        const tileImg = (k, isDouble = false) => {
          const large = isDouble && o.double_style === "large"; // 2x width and height instead of 2x width
          const f = large ? 2 : 1;
          const t = tile(p, theme, catalog.icons[k], o.tile, isDouble && !large, (o.size / 132) * f); // shown at size/132 px per unit
          const fileKey = isDouble ? `${k}-${large ? "big" : "2x"}` : k;
          const src = put(`tiles/${o.tile}-${o.size}/${fileKey}.svg`, t.svg);
          record({ src, module: m.id, w: t.w, h: t.h, hits: [{ type: "icon", key: k, cat, x: 0, y: 0, w: t.w, h: t.h }] });
          return img(src, catalog.icons[k].label, `height="${Math.round((o.size * f * t.h) / 132)}"`);
        };
        const row = (keys) => "<p>\n" + keys.map((k, idx) => {
          const isLastOdd = useAutoDouble && o.double_style !== "large" && idx === keys.length - 1 && keys.length % 2 === 1;
          const isDouble = (useManualDouble && doubleSet.has(k)) || isLastOdd;
          return `  ${tileImg(k, isDouble)}`;
        }).join("\n") + "\n</p>";
        const parts = o.style === "compact" ? [headingBlock(m, o.title)] : [];
        for (const [catKey, keys] of groups) {
          cat = catKey;
          if (o.dissolve_single === "on" && groups.length === 1 && catKey === "general") {
            parts.push(row(keys));
          } else {
            parts.push(headingBlock(m, titleOf(catKey), o.style === "compact", `cat-${catKey}`, catKey), row(keys));
          }
        }
        blocks.push(join(...parts));
        break;
      }
      case "projects": {
        const repos = pickRepos(data, o);
        if (!repos.length && o.empty === "hide") break; // appears by itself once there is a repo to show
        const cards = repos.length
          ? repos.map((r) => link(r.url, img(put(`${m.id}/${r.name}.svg`, projectCard(p, theme, r)), r.name, 'width="49%"')))
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO PUBLIC PROJECTS YET", 430, 132)), "No public projects yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "contributed": {
        const repos = pickContributed(data, o);
        if (!repos.length && o.empty === "hide") break;
        const safeFile = (name) => name.replace(/[^a-z0-9_-]/gi, "_");
        const cards = repos.length
          ? repos.map((r) => link(r.url, img(put(`${m.id}/${safeFile(r.name)}.svg`, projectCard(p, theme, r)), r.name, 'width="49%"')))
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO EXTERNAL CONTRIBUTIONS YET", 430, 132)), "No external contributions yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "releases": {
        const rels = pickReleases(data, o);
        if (!rels.length && o.empty === "hide") break; // appears by itself with the first public release
        const cards = rels.length
          ? rels.map((r) => link(r.url, img(put(`${m.id}/${r.repo}.svg`, releaseCard(p, theme, r)), `${r.repo} ${r.tag}`, 'width="49%"')))
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO RELEASES YET")), "No releases yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "stats":
        blocks.push(join(headingBlock(m, o.title),
          para(img(put(`${m.id}/stats.svg`, statsCard(p, theme, statsFrom(data), o.languages)), "GitHub stats", 'width="100%"'))));
        break;
      case "followers": {
        const svg = followersCard(p, theme, data.followers || 0, data.recentFollowers || [], o.style === "compact" ? 0 : o.limit);
        const profileUrl = data.login ? `https://github.com/${data.login}?tab=followers` : "";
        blocks.push(join(headingBlock(m, o.title),
          para(link(profileUrl, img(put(`${m.id}/followers.svg`, svg), `${data.followers || 0} GitHub followers`, 'width="100%"')))));
        break;
      }
      case "spoken": {
        const rows = splitRows(o.items, 3);
        if (!rows.length) break;
        blocks.push(join(headingBlock(m, o.title),
          fullCard(m, spokenCard(p, theme, rows, o.style), rows.map(([l, lv]) => `${l}${lv ? ` (${lv})` : ""}`).join(", "), "spoken")));
        break;
      }
      case "portfolio": {
        const allocations = splitPortfolio(o.allocations);
        if (!allocations.length) {
          if (o.empty === "hide") break;
          blocks.push(join(headingBlock(m, o.title),
            para(img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO PORTFOLIO ALLOCATIONS CONFIGURED", 880, 108)), "No portfolio data", 'width="100%"')),
            `<p align="center"><sub><em>Keine Anlageberatung. Alle Angaben ohne Gewähr.</em></sub></p>`));
          break;
        }
        const history = data.portfolio?.history || [];
        const svg = portfolioCard(p, theme, allocations, history, o);
        blocks.push(join(
          headingBlock(m, o.title),
          fullCard(m, svg, "Portfolio Allocation and Performance", "portfolio"),
          `<p align="center"><sub><em>Keine Anlageberatung. Alle Angaben ohne Gewähr.</em></sub></p>`
        ));
        break;
      }
      case "steam": {
        const games = pickSteamGames(data.steam, o);
        if (!games.length && o.empty === "hide") break;
        const steamUrl = o.steam_id ? `https://steamcommunity.com/profiles/${encodeURIComponent(o.steam_id)}` : "";
        const svg = steamCard(p, theme, games, o);
        blocks.push(join(
          headingBlock(m, o.title),
          para(link(steamUrl, img(put(`${m.id}/steam.svg`, svg), "Steam Playtime", 'width="100%"')))
        ));
        break;
      }
      case "activity":
        blocks.push(join(headingBlock(m, o.title),
          para(img(put(`${m.id}/activity.svg`, activityCard(p, theme, data.calendar, o.weeks)), "Contribution activity", 'width="100%"'))));
        break;
      case "socials": {
        // icon=url or icon=url|LABEL; a custom label gets its own tile file
        const links = splitPairs(o.items).map(([k, v]) => {
          const [url, label] = v.split("|").map((x) => x.trim());
          return { k, url, label };
        });
        const bad = links.filter((l) => !catalog.icons[l.k]).map((l) => l.k);
        if (bad.length) fail(`${m.id}.items: unknown icon(s) ${bad.join(", ")}`);
        const badUrl = links.filter((l) => !LINK.test(l.url)).map((l) => l.k);
        if (badUrl.length) fail(`${m.id}.items: links must start with https://, http:// or mailto: (${badUrl.join(", ")})`);
        if (!links.length) break;
        const tiles = links.map(({ k, url, label }, i) => {
          const icon = label ? { ...catalog.icons[k], label: label.toUpperCase() } : catalog.icons[k];
          const t = tile(p, theme, icon, o.tile, false, o.size / 132);
          const file = label ? `${m.id}/link-${i + 1}.svg` : `tiles/${o.tile}-${o.size}/${k}.svg`;
          return "  " + link(url, img(put(file, t.svg), icon.label, `height="${Math.round((o.size * t.h) / 132)}"`));
        });
        blocks.push(join(headingBlock(m, o.title), cardRow(tiles)));
        break;
      }
      case "people": {
        const entries = splitPeople(o.items);
        if (!entries.length) break;
        const cards = entries.map((e, i) => {
          checkLink(m, e.url, `"${e.name}" link`);
          let pic = {};
          if (e.image.startsWith("gh:")) pic = { avatar: images[`data/avatars/${e.image.slice(3)}`] }; // initials until fetched
          else if (e.image.startsWith("file:")) {
            const file = e.image.slice(5);
            if (!MEDIA_FILE.test(file) || isVideo(file)) fail(`${m.id}.items: "${e.name}" image file:${file} must be a png/jpg/webp/gif in assets/src`);
            pic = { logo: images[`assets/src/${file}`] ?? fail(`${m.id}.items: assets/src/${file} not found`) };
          } else if (e.image) pic = { icon: catalog.icons[e.image] ?? fail(`${m.id}.items: "${e.name}" image "${e.image}" is neither gh:<login>, file:<name> nor an icon`) };
          const svg = personCard(p, theme, e, pic);
          return link(e.url, img(put(`${m.id}/${i + 1}.svg`, svg), [e.name, e.role].filter(Boolean).join(", "), 'width="49%"'));
        });
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "now": {
        const rows = splitRows(o.items, 2);
        if (rows.length) blocks.push(join(headingBlock(m, o.title), fullCard(m, nowCard(p, theme, rows, o.cursor === "on", o), rows.map((r) => r.join(": ")).join("; "))));
        break;
      }
      case "timeline": {
        const rows = splitRows(o.items, 3);
        if (rows.length) blocks.push(join(headingBlock(m, o.title), fullCard(m, timelineCard(p, theme, rows), rows.map((r) => r.filter(Boolean).join(" ")).join("; "))));
        break;
      }
      case "feed": {
        const items = pickFeed(data, o);
        if (!items.length && o.empty === "hide") break; // appears with the first fetched entry
        const cards = items.length
          ? items.map((it, i) => {
            if (!LINK.test(it.url)) return "";
            const thumb = o.thumbs === "on" && THUMB.test(it.thumb) ? images[it.thumb] : null;
            return link(it.url, img(put(`${m.id}/${i + 1}.svg`, feedCard(p, theme, it, thumb)), it.title, 'width="49%"'));
          })
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NOTHING POSTED YET")), "Nothing posted yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards.filter(Boolean))));
        break;
      }
      case "twitch": {
        if (!o.channel) break; // nothing to show until a channel is set
        const live = data.live?.[o.channel.toLowerCase()] ?? data.live?.["*"];
        if (!live?.live && o.offline === "hide") break; // only visible while live
        blocks.push(join(headingBlock(m, o.title),
          para(link(`https://www.twitch.tv/${o.channel}`, img(put(`${m.id}/live.svg`, liveCard(p, theme, live, o.channel.toUpperCase(), o)),
            live?.live ? `Live on Twitch: ${live.title || o.channel}` : `Twitch: ${o.channel} (offline)`, 'width="100%"')))));
        break;
      }
      case "gists": {
        const gists = (data.gists?.[o.mode] || []).slice(0, o.limit);
        if (!gists.length && o.empty === "hide") break;
        const cards = gists.length
          ? gists.map((g, i) => link(g.url, img(put(`${m.id}/${i + 1}.svg`, projectCard(p, theme, g)), g.name, 'width="49%"')))
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO PUBLIC GISTS YET")), "No public gists yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "code": {
        if (!o.code.trim()) break;
        checkLink(m, o.link, "code.link");
        blocks.push(join(headingBlock(m, o.title), para(link(o.link, img(put(`${m.id}/code.svg`, codeCard(p, theme, o.file, o.code)), `Code: ${o.file}`, 'width="100%"')))));
        break;
      }
      case "guestbook": {
        if (!o.issue) break; // not set up yet
        const g = data.guestbook, ours = g && (g.issue === o.issue || g.issue === "*");
        const entries = (ours ? g.entries : []).filter((e) => o.approval === "all" || e.approved).slice(0, o.limit);
        const url = data.repo ? `https://github.com/${data.repo}/issues/${o.issue}` : "";
        blocks.push(join(headingBlock(m, o.title),
          para(link(url, img(put(`${m.id}/guestbook.svg`, guestbookCard(p, theme, entries)), "Guestbook: click to sign", 'width="100%"')))));
        break;
      }
      case "counter": {
        if (o.url) {
          if (!/^https:\/\//i.test(o.url)) fail(`${m.id}.url must start with https://`);
          blocks.push(join(headingBlock(m, o.title), para(img(esc(o.url), o.label || "Visitor counter", `height="${o.height}"`))));
        } else if (o.fallback_count > 0) {
          const svg = counterSvg(p, theme, o.fallback_count, o.label || "PROFILE VIEWS");
          blocks.push(join(headingBlock(m, o.title), para(img(put(`${m.id}/counter.svg`, svg), o.label || "Profile views", `height="${o.height}"`))));
        }
        break;
      }
      case "divider":
        blocks.push(para(img(put(`${m.id}/divider.svg`, dividerSvg(theme)), "", 'width="100%"')));
        break;
    }
  }

  const readme = "<!-- Generated by scripts/build.mjs from settings.txt. Edit settings.txt (editor: https://matteokaul.github.io/profile-matrix-config/), not this file. -->\n\n" +
    blocks.filter(Boolean).join("\n\n") + "\n";
  return { files, readme };
}

function fail(message) { throw new Error(message); }

/** Fake GitHub, Portfolio & Steam data for local previews (python-free, deterministic). */
export const SAMPLE_DATA = (() => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const weeks = Array.from({ length: 53 }, () => Array.from({ length: 7 }, () => {
    const v = rand();
    return v < 0.45 ? 0 : v < 0.7 ? 1 : v < 0.85 ? 2 : v < 0.95 ? 3 : 4;
  }));
  const repo = (name, description, language, stars, pushedAt, release) => ({
    name, description, language, stars, pushedAt, fork: false, url: "https://github.com",
    languages: { [language]: 1000 * (stars + 3) }, release,
  });
  const gist = (name, description, language, stars) => ({ name, description, language, stars, url: "https://gist.github.com" });
  const video = (title, date) => ({ title, date, url: `https://www.youtube.com/#${date}`, source: "YOUTUBE", thumb: "" });

  // Deterministic sample chain-linked portfolio history (120 days, starting at 100.0)
  let idx = 100;
  const portfolioHistory = Array.from({ length: 120 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10);
    if (i > 0) idx = +(idx * (1 + (rand() - 0.46) * 0.018)).toFixed(2);
    return { date: d, index: idx };
  });

  return {
    login: "sample", repo: "sample/sample", followers: 48, commits: 1280,
    recentFollowers: [
      { login: "octocat" }, { login: "monalisa" }, { login: "hubot" },
      { login: "ada-lovelace" }, { login: "grace-hopper" }, { login: "ken-thompson" },
    ],
    // "*" = used for any feed source / Twitch channel / guestbook issue in the preview
    feeds: { "*": [video("Building a dot-matrix GitHub profile from scratch", "2026-10-30"),
      video("Lorem ipsum: ten tips for cleaner code", "2026-10-12"),
      video("Game jam devlog #3 - lights, sound and bugs", "2026-09-28"),
      video("My desk setup, one year later", "2026-09-02")] },
    live: { "*": { live: true, title: "Coding a dot-matrix font renderer", game: "Software and Game Development" } },
    gists: {
      pinned: [gist("led-font.js", "Tiny 5x7 LED font as JSON glyph grids.", "JavaScript", 4),
        gist("backup.sh", "Nightly backup of a folder in five lines.", "Shell", 2)],
      recent: [gist("notes.md", "Lorem ipsum dolor sit amet, study notes.", "Markdown", 0)],
    },
    guestbook: { issue: "*", entries: [
      { login: "octocat", text: "Love the LED style, very clean!", date: "2026-10-29", approved: true },
      { login: "monalisa", text: "Hello from the other side of the internet!", date: "2026-10-21", approved: true },
      { login: "spam-bot", text: "not approved, only shown with approval = all", date: "2026-10-20", approved: false },
    ] },
    portfolio: {
      updatedAt: "2026-10-28",
      history: portfolioHistory,
    },
    steam: {
      updatedAt: "2026-10-28",
      games: [
        { appid: 427520, name: "Factorio", total: 38400, month: 2640, week: 840 },
        { appid: 1091500, name: "Cyberpunk 2077", total: 14200, month: 1920, week: 540 },
        { appid: 1245620, name: "Elden Ring", total: 11800, month: 1320, week: 360 },
        { appid: 367520, name: "Hollow Knight", total: 6400, month: 780, week: 210 },
        { appid: 413150, name: "Stardew Valley", total: 5100, month: 480, week: 120 },
        { appid: 2379780, name: "Balatro", total: 4320, month: 960, week: 300 },
        { appid: 1145360, name: "Hades", total: 3890, month: 360, week: 90 },
        { appid: 548430, name: "Deep Rock Galactic", total: 3420, month: 240, week: 60 },
        { appid: 105600, name: "Terraria", total: 2940, month: 180, week: 0 },
        { appid: 620, name: "Portal 2", total: 1680, month: 60, week: 0 },
      ],
    },
    pinned: ["lorem-dashboard", "ipsum-lang", "dotfiles"],
    calendar: { total: 742, weeks },
    repos: [
      repo("lorem-dashboard", "Lorem ipsum dolor sit amet: a small self-hosted dashboard.", "TypeScript", 34, "2026-10-30",
        { tag: "v2.3.0", url: "https://github.com", date: "2026-10-28" }),
      repo("ipsum-lang", "Tiny scripting language written in C, compiled to bytecode.", "C", 12, "2026-10-20",
        { tag: "v0.9.1-beta", url: "https://github.com", date: "2026-10-12" }),
      repo("dotfiles", "Shell and editor configuration, managed with a tiny Python script.", "Python", 3, "2026-09-02",
        { tag: "2026.09", url: "https://github.com", date: "2026-09-02" }),
      repo("algorithms", "Consectetur adipiscing elit: classic algorithms as exercises.", "Java", 1, "2026-06-11", null),
    ],
    contributed: [
      repo("example-org/web-framework", "Lorem ipsum: a fast, minimal web framework.", "Go", 18200, "2026-10-29", null),
      repo("example-org/terminal", "Sed do eiusmod: a cross-platform terminal emulator.", "Rust", 9400, "2026-10-25", null),
      repo("example-org/docs", "Ut enim ad minim veniam: community documentation.", "Markdown", 1250, "2026-10-18", null),
    ],
  };
})();
