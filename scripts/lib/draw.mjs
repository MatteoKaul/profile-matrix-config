// Drawing: dot-matrix text and every SVG building block (tiles, cards, banner).
//
// Everything is drawn from a theme (colours, dot shape/size, slant) and a
// font (glyph grids from fonts/*.json, "1" = dot). Functions return SVG text.
import { rgb, splitList, splitPairs } from "./settings.mjs";

export const CARD_W = 880; // width of headings and full-width cards

// ----------------------------------------------------------- dot drawing --

/**
 * Compute LED dot centres for a single character on an `rows × cols` matrix.
 *
 * Strictly preserves the classic sparse LED dot count (1 dot per row per stroke;
 * NEVER inserts extra half-row dots). For diagonal/oblique characters ("A", "M",
 * "V", "W", "X", "R", "N", "K", "Y", "Z"), `font.points[ch]` provides smooth
 * sub-grid horizontal coordinates `[c, r]` on each row `r = 0..rows-1` so that
 * diagonal strokes transition smoothly without full-column integer staircase jumps.
 */
function glyphPoints(ch, font, pitch, slant) {
  const { rows, glyphs, points: subPoints, points_upright: uprightPoints } = font;
  const pt = (c, r) => [c * pitch + (rows - 1 - r) * pitch * slant, r * pitch];

  const activePoints = Math.abs(slant) < 0.08 && uprightPoints?.[ch] ? uprightPoints[ch] : subPoints?.[ch];
  if (activePoints) {
    return activePoints.map(([c, r]) => pt(c, r));
  }

  const grid = glyphs[ch];
  if (!grid) return [];
  const raw = [];
  for (let r = 0; r < rows; r++) {
    const row = grid[r] || "";
    for (let c = 0; c < row.length; c++) {
      if (row[c] === "1") raw.push(pt(c, r));
    }
  }
  return raw;
}

/** Dot centres for `text`. pitch = dot spacing, gap = empty columns between letters. */
function layout(text, pitch, font, { gap = 1, slant = 0.22 } = {}) {
  const { rows, cols } = font;
  const points = [];
  let x = 0;
  for (const ch of String(text).toUpperCase()) {
    for (const [px, py] of glyphPoints(ch, font, pitch, slant)) {
      points.push([x + px, py]);
    }
    x += (cols + gap) * pitch;
  }
  const width = Math.max(0, x - (gap + 1) * pitch + (rows - 1) * pitch * slant);
  return { points, width, height: (rows - 1) * pitch };
}

/** Solid vector layout for `style = "standard"`, using the font's normalized 100-unit vector contours. */
function vectorLayout(text, targetH, vectorFont, { gap = 1, slant = 0.22 } = {}) {
  const scale = targetH / (vectorFont.height || 100);
  const letterGap = gap * 10 * scale;
  const spaceAdv = (vectorFont.space || 32) * scale;
  const paths = [];
  let x = 0;
  const str = String(text).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const g = vectorFont.glyphs?.[ch];
    if (g && g.d) {
      const skew = slant ? ` skewX(${n(-Math.atan(slant) * (180 / Math.PI))})` : "";
      const xShift = slant ? n(targetH * slant) : 0;
      paths.push(`<path transform="translate(${n(x + xShift)} 0) scale(${scale.toFixed(4)})${skew}" d="${g.d}"/>`);
      x += g.w * scale + (i < str.length - 1 ? letterGap : 0);
    } else {
      x += spaceAdv + (i < str.length - 1 ? letterGap : 0);
    }
  }
  const width = Math.max(0, x + targetH * slant);
  return { svgBody: paths.join(""), width, height: targetH };
}

const n = (v) => +v.toFixed(1); // keep SVG numbers short

/** Effective animation speed multiplier (global theme speed * optional module speed). */
const animSpeed = (theme, opt) => Math.max(0.1, (Number(theme?.animation_speed) || 1) * (Number(opt?.animation_speed) || 1));

/** One <path> "d" drawing all dots, so the files stay small. */
function dotPath(points, r, shape) {
  return points.map(([x, y]) => {
    if (shape === "square") return `M${n(x - r)} ${n(y - r)}h${n(2 * r)}v${n(2 * r)}h${n(-2 * r)}z`;
    if (shape === "rounded") {
      const k = n(r * 0.45), s = n(2 * r - 2 * k);
      return `M${n(x - r + k)} ${n(y - r)}h${s}q${k} 0 ${k} ${k}v${s}q0 ${k} ${-k} ${k}h${-s}q${-k} 0 ${-k} ${-k}v${-s}q0 ${-k} ${k} ${-k}z`;
    }
    return `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0z`;
  }).join("");
}

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const svgDoc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// ------------------------------------------------------------- surfaces --
//
// Shape rules (docs/design-essence.txt, "Corners and outlines"):
//  1. Same radius and line width ON SCREEN for every surface. Images are shown
//     at different scales (banner 0.55x, icon tiles 0.5-0.8x), so every value
//     is divided by k = displayed px per drawing unit.
//  2. Strokes sit inside the shape: inset by half the line width, radius
//     reduced by the same amount, so the line is concentric with the fill.
//  3. Nested shapes are concentric: inner radius = outer radius - gap, never
//     below R/3 (and 0 when R = 0); a radius is at most half the short side.

/** Stroke attributes for theme.edge (width in drawing units). */
export const edge = (theme, width = theme.edge.width) =>
  `stroke="${theme.edge.color}"${theme.edge.opacity < 1 ? ` stroke-opacity="${theme.edge.opacity}"` : ""}${width !== 1 ? ` stroke-width="${n(width)}"` : ""}`;

/** Outer corner radius of a w x h surface shown at k px per unit. */
const radiusFor = (theme, w, h, k = 1) => Math.max(0, Math.min(theme.radius / k, w / 2, h / 2));

/** Radius for a shape sitting `gap` units inside a surface (rule 3), in drawing units. */
export const innerRadius = (theme, gap, k = 1) =>
  theme.radius <= 0 ? 0 : n(Math.max(theme.radius - gap * k, theme.radius / 3) / k);

/**
 * Background and/or outline of a w x h surface at (0, 0), shown at k px per unit.
 * fill: theme.fill unless given; withEdge: draw the outline (inside, rule 2).
 */
export function surface(theme, w, h, { k = 1, withEdge = true, fill = theme.fill } = {}) {
  const r = radiusFor(theme, w, h, k), sw = theme.edge.width / k;
  const bg = fill && fill !== "none" ? `<rect width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}"/>` : "";
  if (!withEdge) return bg;
  return bg + `<rect x="${n(sw / 2)}" y="${n(sw / 2)}" width="${n(w - sw)}" height="${n(h - sw)}" rx="${n(Math.max(0, r - sw / 2))}" ` +
    `fill="none" ${edge(theme, sw)}/>`;
}

/** Drawing context bound to a theme and font (supports both "led" and "standard" renderer styles). */
export function painter(theme, font, styleOverride) {
  const small = font.small, large = font.large || font.small;
  const renderStyle = (styleOverride && styleOverride !== "theme" ? styleOverride : theme.style) || "led";
  // Small text keeps the height of a 7-row font whatever the font's rows are,
  // so layouts work with every font (micro: 5 rows -> 1.5x the pitch).
  const norm = 6 / (small.rows - 1);

  /** Render text in either LED dot-matrix style or solid Standard vector style. */
  function text(str, x, y, { pitch, fill, anchor = "start", gap = 1, large: big = false, r, style: callStyle } = {}) {
    const activeStyle = callStyle || renderStyle;
    if (activeStyle === "standard" && font.vector) {
      const effPitch = big ? pitch : pitch * norm;
      const radius = r ?? effPitch * theme.dot;
      const gridRows = (big ? large : small).rows;
      const h = (gridRows - 1) * effPitch + 2 * radius;
      const v = vectorLayout(str, h, font.vector, { gap, slant: theme.slant });
      const w = v.width;
      const ox = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
      const svg = v.svgBody ? `<g fill="${fill}" transform="translate(${n(ox)} ${n(y)})">${v.svgBody}</g>` : "";
      return { svg, w, h };
    }
    if (!big) pitch *= norm;
    const radius = r ?? pitch * theme.dot;
    const { points, width, height } = layout(str, pitch, big ? large : small, { gap, slant: theme.slant });
    const w = width + 2 * radius, h = height + 2 * radius;
    const ox = (anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x) + radius;
    const d = dotPath(points.map(([px, py]) => [px + ox, py + y + radius]), radius, theme.shape);
    return { svg: d ? `<path fill="${fill}" d="${d}"/>` : "", w, h };
  }

  /** Width of `str` at pitch 1 (scales linearly), for fitting. */
  const unitWidth = (str, opts = {}) => {
    const activeStyle = opts.style || renderStyle;
    if (activeStyle === "standard" && font.vector) {
      const gridRows = (opts.large ? large : small).rows;
      const effNorm = opts.large ? 1 : norm;
      const h = (gridRows - 1) * effNorm + 2 * theme.dot * effNorm;
      return vectorLayout(str, h, font.vector, { gap: opts.gap ?? 1, slant: theme.slant }).width;
    }
    return layout(str, 1, opts.large ? large : small, { gap: opts.gap ?? 1, slant: theme.slant }).width * (opts.large ? 1 : norm);
  };

  /** Shorten str with a trailing "." until it fits maxWidth at this pitch. */
  function truncate(str, pitch, maxWidth) {
    const fits = (s) => (unitWidth(s) + 2 * theme.dot * norm) * pitch <= maxWidth;
    if (fits(str)) return str;
    while (str.length > 1 && !fits(str + ".")) str = str.slice(0, -1);
    return str + ".";
  }

  /** Card background + outline + content, without the <svg> wrapper (k = display scale). */
  const cardBody = (w, h, body, k = 1) => surface(theme, w, h, { k }) + body;
  const card = (w, h, body, k = 1) => svgDoc(w, h, cardBody(w, h, body, k));

  return { text, unitWidth, truncate, card, cardBody, small, large, norm };
}

// --------------------------------------------------------------- pieces --

export function heading(p, theme, label, small = false) {
  const pitch = small ? 3.2 : 5.6, padY = small ? 10 : 16;
  const t = p.text(label, 24, padY, { pitch, fill: small ? theme.muted : theme.fg });
  const h = Math.round(t.h + 2 * padY);
  return svgDoc(CARD_W, h, surface(theme, CARD_W, h, { withEdge: theme.outlined }) + t.svg);
}

const TILE_W = 168, TILE_H = 132, TILE_GAP = 6;

/**
 * One icon as a card, in one of three styles (all scale with the README):
 *   below  168x132 (or 342x132 when doubleWidth = true), logo on top, label below
 *   none   132x132 (or 270x132 when doubleWidth = true), logo only
 *   badge  48 high, logo left, label right; width follows the label (or 2x min width)
 * Returns {w, h, body}; body is SVG without the <svg> wrapper.
 */
export function tileParts(p, theme, icon, style = "below", doubleWidth = false, k = 1) {
  const logo = (size, cx, cy) => { // logos are 24x24 markup; wordmarks get a larger "scale"
    const s = size * (icon.scale || 1);
    return `<g transform="translate(${n(cx - s / 2)} ${n(cy - s / 2)}) scale(${(s / 24).toFixed(3)})" ` +
      `fill="${theme.fg}" color="${theme.fg}">${icon.svg}</g>`;
  };
  if (style === "none") {
    const w = doubleWidth ? TILE_H * 2 + TILE_GAP : TILE_H;
    return { w, h: TILE_H, body: p.cardBody(w, TILE_H, logo(60, w / 2, TILE_H / 2), k) };
  }
  if (style === "badge") {
    const H = 48, label = p.text(icon.label, 0, 0, { pitch: 2.6, fill: theme.muted });
    const baseW = Math.ceil(16 + 26 + 12 + label.w + 16);
    const w = doubleWidth ? Math.max(baseW * 2 + TILE_GAP, 280) : baseW;
    return { w, h: H, body: p.cardBody(w, H, logo(26, 16 + 13, H / 2) + `<g transform="translate(54 ${n((H - label.h) / 2)})">${label.svg}</g>`, k) };
  }
  const W = doubleWidth ? TILE_W * 2 + TILE_GAP : TILE_W;
  // Long labels get tighter letter spacing, then a smaller pitch, so they always fit.
  const gap = icon.label.length > 8 && !doubleWidth ? 0.6 : 1;
  const pitch = Math.min(3.0, (W - 16) / (p.unitWidth(icon.label, { gap }) + 2 * theme.dot * p.norm));
  const label = p.text(icon.label, W / 2, 0, { pitch, fill: theme.muted, gap, anchor: "middle" });
  return { w: W, h: TILE_H, body: p.cardBody(W, TILE_H,
    `${logo(48, W / 2, 46)}<g transform="translate(0 ${n(112 - label.h / 2)})">${label.svg}</g>`, k) };
}

/** One icon card as a standalone SVG shown at k px per unit; also returns its size. */
export function tile(p, theme, icon, style = "below", doubleWidth = false, k = 1) {
  const t = tileParts(p, theme, icon, style, doubleWidth, k);
  return { svg: svgDoc(t.w, t.h, t.body), w: t.w, h: t.h };
}

/**
 * Categories side by side (icons module with columns > 1). Each row of
 * categories is one SVG, so a category's tiles always stay in its own column.
 * Supports:
 *   - continuity: "unified" (Mode A: uniform column widths) vs "granular" (Mode B: per-category column span & manual overrides)
 *   - double_mode: "off" | "auto" (fills odd rows) | "manual" (double_items) | "both"
 *   groups  [[title, [icon], catKey]] in display order
 * Returns [{svg, alt}], one per row.
 */
export function categoryRows(p, theme, groups, o) {
  const GAP = 12, HEAD = 40;
  const scale = o.tile === "badge" ? (o.grid_size * 0.5) / 48 : o.grid_size / TILE_H;
  const unitColW = (CARD_W - (o.columns - 1) * GAP) / o.columns;
  const manualSpans = Object.fromEntries(splitPairs(o.col_spans || "").map(([k, v]) => [k.toLowerCase(), Math.max(1, Math.min(o.columns, Number(v) || 1))]));
  const doubleSet = new Set(splitList(o.double_items || "").map((k) => k.toLowerCase()));
  const useManualDouble = o.double_mode === "manual" || o.double_mode === "both" || o.continuity === "granular";
  const useAutoDouble = o.double_mode === "auto" || o.double_mode === "both";

  const spanOf = (g) => {
    const [, icons, catKey = ""] = g;
    if (o.continuity === "granular" && manualSpans[catKey.toLowerCase()]) return manualSpans[catKey.toLowerCase()];
    if (o.wide_toggle === "on" && icons.length > o.wide_above) return o.columns;
    return 1;
  };

  // Pack categories into rows of up to `o.columns` total span units.
  const rows = [];
  let current = [], currentSpan = 0;
  for (const g of groups) {
    const span = spanOf(g);
    if (currentSpan + span > o.columns && current.length) {
      rows.push(current);
      current = [];
      currentSpan = 0;
    }
    current.push({ g, span });
    currentSpan += span;
    if (currentSpan === o.columns) {
      rows.push(current);
      current = [];
      currentSpan = 0;
    }
  }
  if (current.length) rows.push(current);

  return rows.map((row) => {
    // In unified mode (Mode A), if a row has fewer spans than o.columns (e.g. a wide category), keep uniform column widths unless full-row
    let xCursor = 0;
    const cells = row.map(({ g: [title, icons], span }) => {
      const cellW = span * unitColW + (span - 1) * GAP;
      const x0 = xCursor;
      xCursor += cellW + GAP;

      const pitch = Math.max(1.8, Math.min(3.0, (cellW - 28) / (p.unitWidth(title) + 2 * theme.dot * p.norm)));
      const label = p.text(p.truncate(title, pitch, cellW - 28), x0 + 14, 0, { pitch, fill: theme.fg });
      const head = `<g transform="translate(${n(x0)} 0)">${surface(theme, cellW, HEAD, { withEdge: theme.outlined })}</g>` +
        `<g transform="translate(0 ${n((HEAD - label.h) / 2)})">${label.svg}</g>`;

      // Calculate how many single tiles fit per line in this column
      const singleW = (o.tile === "none" ? TILE_H : TILE_W) * scale;
      const colsPerLine = Math.max(1, Math.floor((cellW + TILE_GAP) / (singleW + TILE_GAP)));

      // Determine which icons get double width (manual selection + optional auto-fill for odd rows)
      let x = 0, y = HEAD + 8, lineH = 0, slotsUsedInLine = 0;
      const tiles = icons.map((icon, idx) => {
        const key = (icon.key || "").toLowerCase();
        let isDouble = useManualDouble && doubleSet.has(key);
        const isLast = idx === icons.length - 1;
        if (!isDouble && useAutoDouble && isLast && colsPerLine >= 2 && (slotsUsedInLine % colsPerLine) === colsPerLine - 2) {
          isDouble = true;
        } else if (!isDouble && useAutoDouble && isLast && colsPerLine === 2 && slotsUsedInLine === 0 && icons.length % 2 === 1) {
          isDouble = true;
        }
        const t = tileParts(p, theme, icon, o.tile, isDouble, scale); // drawn scaled: compensate radius and line
        const w = Math.min(cellW, t.w * scale), h = t.h * scale;
        if (x > 0 && x + w > cellW + 0.5) {
          x = 0;
          y += lineH + TILE_GAP;
          lineH = 0;
          slotsUsedInLine = 0;
        }
        const svg = `<svg x="${n(x0 + x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${t.w} ${t.h}">${t.body}</svg>`;
        x += w + TILE_GAP;
        lineH = Math.max(lineH, h);
        slotsUsedInLine += isDouble ? 2 : 1;
        return svg;
      });
      return { svg: head + tiles.join(""), h: y + lineH };
    });
    const height = Math.ceil(Math.max(...cells.map((c) => c.h)));
    return { svg: svgDoc(CARD_W, height, cells.map((c) => c.svg).join("")), alt: row.map(({ g: [t] }) => t).join(" · ") };
  });
}

export function placeholderCard(p, theme, message, w = 430, h = 108) {
  const t = p.text(message, 22, 0, { pitch: 3.0, fill: theme.faint });
  return p.card(w, h, `<g transform="translate(0 ${n((h - t.h) / 2)})">${t.svg}</g>`);
}

/** Star outline-free polygon, 12px, for the stars count. */
const star = (x, y, fill) => `<path fill="${fill}" transform="translate(${x} ${y}) scale(.5)" d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5L7 14l-5.3-5 7.2-.9z"/>`;

function wrapWords(str, maxChars, maxLines) {
  const lines = [];
  let line = "";
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > maxChars) { lines.push(line); line = word; } else line = (line + " " + word).trim();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines.join(" ").length < String(str).trim().length)
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1).replace(/\s*$/, "…");
  return lines;
}

export function projectCard(p, theme, repo) {
  const W = 430, H = 132, pad = 22;
  const name = p.text(p.truncate(repo.name, 3.4, W - 2 * pad), pad, 18, { pitch: 3.4, fill: theme.fg });
  const desc = wrapWords(repo.description || "No description.", 50, 2).map((l, i) =>
    `<text x="${pad}" y="${64 + i * 18}" font-family="${esc(theme.text_font)}" font-size="13" fill="${theme.muted}">${esc(l)}</text>`).join("");
  const lang = p.text(repo.language || "", pad, 100, { pitch: 2.6, fill: theme.muted });
  const stars = p.text(String(repo.stars), W - pad, 100, { pitch: 2.6, fill: theme.fg, anchor: "end" });
  return p.card(W, H, name.svg + desc + lang.svg + stars.svg + star(W - pad - stars.w - 16, 99, theme.fg));
}

/**
 * Person / company card (430x96): image, name, role.
 *   pic  {avatar} GitHub avatar (round, greyscale) | {logo} image file (rounded
 *        square, greyscale) | {icon} catalog logo | {} initials in dots
 */
export function personCard(p, theme, entry, pic = {}) {
  const W = 430, H = 96, R = 28, cx = 22 + R, cy = H / 2;
  let image;
  const photo = (img, clip) => `<defs><clipPath id="c">${clip}</clipPath>` +
    `<filter id="g"><feColorMatrix type="saturate" values="0"/></filter></defs>` +
    `<image href="data:${img.mime};base64,${img.base64}" x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" ` +
    `preserveAspectRatio="xMidYMid ${pic.logo ? "meet" : "slice"}" clip-path="url(#c)" filter="url(#g)"/>`;
  if (pic.avatar) image = photo(pic.avatar, `<circle cx="${cx}" cy="${cy}" r="${R}"/>`);
  else if (pic.logo) {
    image = `<rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" rx="${innerRadius(theme, cx - R)}" fill="${theme.dim}"/>` +
      photo(pic.logo, `<rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" rx="${innerRadius(theme, cx - R)}"/>`);
  } else if (pic.icon) {
    const size = 32 * (pic.icon.scale || 1);
    image = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${theme.dim}"/>` +
      `<g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${(size / 24).toFixed(3)})" fill="${theme.fg}" color="${theme.fg}">${pic.icon.svg}</g>`;
  } else {
    const initials = entry.name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2);
    const t = p.text(initials, cx, 0, { pitch: 3.0, fill: theme.fg, anchor: "middle" });
    image = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${theme.dim}"/><g transform="translate(0 ${n(cy - t.h / 2)})">${t.svg}</g>`;
  }
  const x = cx + R + 18, maxW = W - x - 20;
  const name = p.text(p.truncate(entry.name, 3.4, maxW), x, 22, { pitch: 3.4, fill: theme.fg });
  const role = entry.role ? p.text(p.truncate(entry.role, 2.4, maxW), x, 58, { pitch: 2.4, fill: theme.muted }).svg : "";
  return p.card(W, H, image + name.svg + role);
}

export function releaseCard(p, theme, rel) {
  const W = 430, H = 108, pad = 22;
  const tag = p.text(p.truncate(rel.tag, 2.8, 200), W - pad, 78, { pitch: 2.8, fill: theme.fg, anchor: "end" });
  return p.card(W, H, [
    p.text("LATEST RELEASE", pad, 16, { pitch: 2.2, fill: theme.faint }).svg,
    p.text(p.truncate(rel.repo, 3.4, W - 2 * pad), pad, 40, { pitch: 3.4, fill: theme.fg }).svg,
    p.text(rel.date, pad, 78, { pitch: 2.8, fill: theme.muted }).svg,
    tag.svg,
  ].join(""));
}

const short = (v) => (v >= 10000 ? `${(v / 1000).toFixed(1)}K`.replace(".0K", "K") : String(v));

export function statsCard(p, theme, s, languages) {
  const W = CARD_W, parts = [];
  const items = [["REPOS", s.repos], ["STARS", s.stars], ["COMMITS", s.commits], ["FOLLOWERS", s.followers]];
  const col = (W - 48) / items.length;
  items.forEach(([label, value], i) => {
    const num = p.text(short(value), 24 + i * col, 28, { pitch: 5.5, fill: theme.fg });
    parts.push(num.svg, p.text(label, 24 + i * col, 28 + num.h + 16, { pitch: 3.0, fill: theme.muted }).svg);
  });
  let y = 124;
  if (languages > 0) {
    y += 24;
    parts.push(p.text("TOP LANGUAGES", 24, y, { pitch: 3.0, fill: theme.muted }).svg);
    y += 40;
    const langs = s.languages.slice(0, languages);
    if (!langs.length) { parts.push(p.text("NO PUBLIC CODE YET", 24, y, { pitch: 4.0, fill: theme.faint }).svg); y += 30; }
    for (const [name, pct] of langs) {
      parts.push(p.text(p.truncate(name, 3.0, 220), 24, y, { pitch: 3.0, fill: theme.fg }).svg);
      const filled = Math.max(1, Math.round((pct / 100) * 44));
      for (let k = 0; k < 44; k++)
        parts.push(`<circle cx="${263 + k * 11}" cy="${y + 8}" r="3" fill="${k < filled ? theme.fg : theme.dim}"/>`);
      parts.push(p.text(`${Math.round(pct)}%`, W - 24, y, { pitch: 3.0, fill: theme.muted, anchor: "end" }).svg);
      y += 30;
    }
  }
  return p.card(W, y + 4, parts.join(""));
}

export function activityCard(p, theme, calendar, weeks) {
  const W = CARD_W, cols = calendar.weeks.slice(-weeks);
  const pitch = (W - 48) / Math.max(cols.length, 1), r = n(pitch * 0.32);
  const opacity = [0, 0.3, 0.5, 0.75, 1];
  const head = p.text(`${calendar.total} CONTRIBUTIONS IN THE LAST YEAR`, 24, 20, { pitch: 3.0, fill: theme.muted });
  const dots = cols.flatMap((week, x) => week.map((level, y) =>
    `<circle cx="${n(24 + pitch * (x + 0.5))}" cy="${n(54 + pitch * (y + 0.5))}" r="${r}" fill="${level ? theme.fg : theme.dim}"` +
    (level && level < 4 ? ` fill-opacity="${opacity[level]}"` : "") + "/>"));
  return p.card(W, Math.round(54 + pitch * 7 + 20), head.svg + dots.join(""));
}

export function dividerSvg(theme) {
  const dots = [];
  for (let x = 6; x < CARD_W; x += 14) dots.push(`<circle cx="${x}" cy="12" r="1.8"/>`);
  return svgDoc(CARD_W, 24, `<g fill="${theme.faint}">${dots.join("")}</g>`);
}

/**
 * Banner: photo / animation (greyscale, darkened) or colour, title in the
 * large font with a soft letter shadow, optional title animation, blinking
 * cursor and scrolling ticker (CSS animations, switched off for viewers who
 * prefer reduced motion).
 *   p       painter for the banner font
 *   image   {mime, base64, width, height} or null; animated gif/webp just play
 *   invert  light-mode version: inverted photo, letters in theme.fg
 */
export function bannerSvg(p, theme, opt, image, invert = false) {
  const W = 1600, H = 420, defs = [], body = [], css = [];
  const speed = animSpeed(theme, opt);
  if (image) {
    // Photo scaled to the banner width; `position` picks the visible band.
    const scale = W / image.width, ph = image.height * scale;
    const y = -Math.max(0, ph - H) * (opt.position / 100);
    const b = opt.brightness / 100, contrast = opt.contrast / 100;
    let slope = contrast * b, intercept = b * 0.5 * (1 - contrast);
    if (invert) [slope, intercept] = [-slope, 1 - intercept];
    const tint = opt.tint.toLowerCase().startsWith("#ffffff") || opt.tint.toLowerCase() === "#fff" ? ""
      : `<feColorMatrix type="matrix" values="${rgb(opt.tint).map((v, i) =>
        [0, 1, 2, 3].map((j) => (i === j ? (v / 255).toFixed(3) : 0)).join(" ") + " 0").join(" ")} 0 0 0 1 0"/>`;
    defs.push(`<filter id="photo" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/>` +
      `<feComponentTransfer>${["R", "G", "B"].map((c) =>
        `<feFunc${c} type="linear" slope="${slope.toFixed(3)}" intercept="${intercept.toFixed(3)}"/>`).join("")}` +
      `</feComponentTransfer>${tint}</filter>`);
    body.push(`<image href="data:${image.mime};base64,${image.base64}" x="0" y="${n(y)}" width="${W}" height="${n(ph)}" ` +
      `preserveAspectRatio="none" filter="url(#photo)"/>`);
  } else if (theme.fill !== "none") body.push(`<rect width="${W}" height="${H}" fill="${opt.color}"/>`);

  const title = String(opt.title).toUpperCase();
  const bad = [...new Set(title)].filter((c) => c !== " " && !(p.large.glyphs[c]));
  if (bad.length) throw new Error(`banner.title: unsupported characters ${bad.join(" ")} (use ${p.large.glyphs["1"] ? "A-Z, 0-9" : "A-Z"} and spaces)`);
  const cursor = opt.cursor === "on", animated = cursor || opt.effect !== "none";
  if (title.trim() || cursor) {
    const big = { large: true, gap: 2 };
    const advance = (p.large.cols + 2); // per character, at pitch 1
    // the cursor sits one character after the title (or alone)
    const units = title ? p.unitWidth(title, big) + (cursor ? advance : 0) : p.large.cols - 1;
    const pitch = Math.min(15, (W * 0.85) / units);
    const shadowFill = invert ? theme.bg : "#000";
    const r = pitch * 0.6, dy = pitch * 0.6 - pitch * theme.dot; // shadow dots: larger, so shifted up
    if (opt.shadow > 0) defs.push(`<filter id="shadow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>`);
    const shadowOf = (str, x, anchor) => opt.shadow > 0
      ? `<g transform="translate(0 ${n(-dy)})" opacity="${opt.shadow / 100}" filter="url(#shadow)">${
        p.text(str, x - dy, 0, { pitch, fill: shadowFill, ...big, anchor, r }).svg}</g>` : "";
    const t = p.text(title, W / 2, 0, { pitch, fill: theme.fg, ...big, anchor: "middle" });
    const ty = n((H - t.h) / 2);
    if (!animated) {
      // Static title: one shadow + one path (the classic banner).
      if (opt.shadow > 0) body.push(`<g transform="translate(0 ${n(ty - dy)})" opacity="${opt.shadow / 100}" filter="url(#shadow)">${
        p.text(title, W / 2, 0, { pitch, fill: shadowFill, ...big, anchor: "middle", r }).svg}</g>`);
      body.push(`<g transform="translate(0 ${ty})">${t.svg}</g>`);
    } else {
      // Animated: every letter is its own group so it can be switched on and off.
      const left = W / 2 - (units * pitch + 2 * pitch * theme.dot) / 2;
      const chars = [...title];
      const letters = chars.map((ch, i) => ch === " " ? "" :
        `<g class="c c${i}" style="--i:${i}">${shadowOf(ch, left + i * advance * pitch, "start")}` +
        p.text(ch, left + i * advance * pitch, 0, { pitch, fill: theme.fg, ...big }).svg + "</g>");
      const n1 = chars.length;
      let cursorSvg = "";

      if (opt.effect === "type" && n1 > 0) {
        // Terminal typing timeline:
        // 1. Pre-delay (0..pre): empty line, cursor blinks at slot 0
        // 2. Typing burst (pre..pre + n1*step): letters appear one by one while cursor steps right (solid)
        // 3. Hold phase (..tClear): full title visible, cursor blinks at slot n1
        // 4. Clear & reset (tClear..dur): all letters clear simultaneously, cursor snaps back to slot 0
        const pre = 0.55 / speed;
        const step = 0.18 / speed;
        const hold = 2.8 / speed;
        const post = 0.65 / speed;
        const tTyped = pre + n1 * step;
        const tClear = tTyped + hold;
        const dur = +(tClear + post).toFixed(2);
        const pct = (t) => +((t / dur) * 100).toFixed(2);
        const pClear = pct(tClear);

        chars.forEach((ch, i) => {
          if (ch === " ") return;
          const pOn = pct(pre + (i + 1) * step);
          css.push(`.c${i}{animation:t${i} ${dur}s step-end infinite}`,
            `@keyframes t${i}{0%{opacity:0}${pOn}%{opacity:1}${pClear}%{opacity:0}}`);
        });

        if (cursor) {
          // Draw cursor at slot 0 (left) and step it across each character slot as letters are typed
          const cx0 = left + pitch * theme.dot;
          const cy = (p.large.rows - 1) * pitch + pitch * theme.dot;
          const pts = Array.from({ length: p.large.cols }, (_, c) => [cx0 + c * pitch, cy]);
          cursorSvg = `<g class="kc"><path class="k" fill="${theme.fg}" d="${dotPath(pts, pitch * theme.dot, theme.shape)}"/></g>`;

          const moveStops = [`0%{transform:translateX(0)}`];
          for (let i = 0; i < n1; i++) {
            const pOn = pct(pre + (i + 1) * step);
            const dx = n((i + 1) * advance * pitch);
            moveStops.push(`${pOn}%{transform:translateX(${dx}px)}`);
          }
          moveStops.push(`${pClear}%{transform:translateX(0)}`);

          // Cursor blink synchronized with typing: solid while moving, blinking during pauses
          const blinkHalf = 0.5 / speed;
          const blinkStops = [`0%{opacity:1}`];
          if (pre > 0.3 / speed) {
            blinkStops.push(`${pct(pre * 0.5)}%{opacity:0}`, `${pct(pre)}%{opacity:1}`);
          }
          let bt = tTyped + blinkHalf, vis = 0;
          while (bt < tClear - 0.08 / speed) {
            blinkStops.push(`${pct(bt)}%{opacity:${vis}}`);
            vis = vis ? 0 : 1;
            bt += blinkHalf;
          }
          blinkStops.push(`${pClear}%{opacity:1}`);
          if (post > 0.3 / speed) {
            blinkStops.push(`${pct(tClear + post * 0.55)}%{opacity:0}`);
          }

          css.push(
            `.kc{animation:cmove ${dur}s step-end infinite}`,
            `@keyframes cmove{${moveStops.join("")}}`,
            `.k{animation:cblink ${dur}s step-end infinite}`,
            `@keyframes cblink{${blinkStops.join("")}}`
          );
        }
      } else {
        if (opt.effect === "flicker") {
          letters.forEach((l, i) => { if (l && (i * 7 + 3) % 5 === 0) letters[i] = l.replace(`class="c c${i}"`, `class="c c${i} f"`); });
          if (!letters.some((l) => l.includes(" f\""))) {
            const idx = letters.findIndex(Boolean);
            if (idx >= 0) letters[idx] = letters[idx].replace(`class="c c${idx}"`, `class="c c${idx} f"`);
          }
          css.push(`.f{animation:flicker ${n(5 / speed)}s step-end infinite;animation-delay:calc(var(--i) * -1.3s)}`,
            `@keyframes flicker{0%,40%,44%,47%,78%,81%,100%{opacity:1}42%{opacity:.15}45%{opacity:.4}79%{opacity:.2}}`);
        } else if (opt.effect === "pulse") {
          css.push(`.t{animation:pulse ${n(4 / speed)}s ease-in-out infinite}@keyframes pulse{50%{opacity:.68}}`);
        }
        if (cursor) {
          // Static position: an underscore of dots in the bottom row, one character after the title.
          const cx = left + (title ? n1 * advance * pitch : 0) + pitch * theme.dot;
          const cy = (p.large.rows - 1) * pitch + pitch * theme.dot;
          const pts = Array.from({ length: p.large.cols }, (_, c) => [cx + c * pitch, cy]);
          cursorSvg = `<path class="k" fill="${theme.fg}" d="${dotPath(pts, pitch * theme.dot, theme.shape)}"/>`;
          css.push(`.k{animation:blink ${n(1.1 / speed)}s step-end infinite}@keyframes blink{50%{opacity:0}}`);
        }
      }
      body.push(`<g class="t" transform="translate(0 ${ty})">${letters.join("")}${cursorSvg}</g>`);
    }
  }

  if (opt.ticker) {
    // Ticker: the text repeated along a dark band, moved left by exactly one repeat.
    const BAND = 52, tp = 3.6, text = String(opt.ticker).toUpperCase() + "      ";
    const L = [...text].length * (p.small.cols + 1) * tp * p.norm;
    const copies = Math.ceil(W / L) + 1;
    const line = p.text(text.repeat(copies), 0, 0, { pitch: tp, fill: theme.fg });
    body.push(`<rect y="${H - BAND}" width="${W}" height="${BAND}" fill="${theme.bg}" opacity=".55"/>`,
      `<g transform="translate(24 ${n(H - BAND + (BAND - line.h) / 2)})"><g class="tk">${line.svg}</g></g>`);
    css.push(`.tk{animation:tick ${n(L / (opt.ticker_speed * speed))}s linear infinite}@keyframes tick{to{transform:translateX(-${n(L)}px)}}`);
  }
  const style = css.length ? `<style>${css.join("")}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>` : "";
  // Shown at 100 % README width: same corners and outline as the cards (rule 1).
  const k = CARD_W / W, r = n(radiusFor(theme, W, H, k));
  if (r > 0) defs.push(`<clipPath id="corners"><rect width="${W}" height="${H}" rx="${r}"/></clipPath>`);
  const content = r > 0 ? `<g clip-path="url(#corners)">${body.join("")}</g>` : body.join("");
  const frame = theme.outlined ? surface(theme, W, H, { k, fill: "none" }) : "";
  return svgDoc(W, H, `${style}<defs>${defs.join("")}</defs>${content}${frame}`);
}

// ------------------------------------------------------- more modules --

/** Plain text in the theme's text font (for longer, free-form text). */
const words = (theme, str, x, y, { size = 14, fill = theme.muted, anchor = "start" } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${esc(theme.text_font)}" font-size="${size}" fill="${fill}"` +
  `${anchor === "start" ? "" : ` text-anchor="${anchor}"`} xml:space="preserve">${esc(str)}</text>`;
const clip = (str, max) => (str.length > max ? str.slice(0, max - 1).trimEnd() + "…" : str);
const blinkStyle = (speed = 1) => `<style>.k{animation:blink ${n(1.1 / speed)}s step-end infinite}@keyframes blink{50%{opacity:0}}` +
  `@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`;

/** Now: LABEL | text rows, labels in dots; optional blinking cursor. */
export function nowCard(p, theme, rows, cursor, opt = {}) {
  const W = CARD_W, ROW = 40, pad = 24;
  const labelW = Math.min(240, Math.max(...rows.map(([l]) => p.unitWidth(l) * 2.8)) + 2 * 2.8 * theme.dot);
  const x2 = pad + labelW + 28, maxChars = Math.floor((W - x2 - pad) / 8.6);
  const parts = rows.map(([label, text], i) => {
    const y = 22 + i * ROW;
    return p.text(p.truncate(label, 2.8, 240), pad, y, { pitch: 2.8, fill: theme.muted }).svg +
      words(theme, clip(text, maxChars), x2, y + 15, { size: 15, fill: theme.fg });
  });
  let extra = "";
  if (cursor) { // after the last line's text (monospace estimate)
    const last = clip(rows[rows.length - 1][1], maxChars);
    const cx = x2 + last.length * 9 + 10, cy = 22 + (rows.length - 1) * ROW + 9;
    extra = blinkStyle(animSpeed(theme, opt)) + `<rect class="k" x="${n(cx)}" y="${cy - 8}" width="9" height="16" rx="2" fill="${theme.fg}"/>`;
  }
  return p.card(W, 22 + rows.length * ROW + 6, extra + parts.join(""));
}

/** Timeline: WHEN | TITLE | detail rows on a dotted vertical line, newest first. */
export function timelineCard(p, theme, rows) {
  const W = CARD_W, ROW = 70, lineX = 196, x = lineX + 28, top = 26;
  const parts = [];
  const H = top + rows.length * ROW;
  for (let y = top + 8; y < H - ROW + 12; y += 8) parts.push(`<circle cx="${lineX}" cy="${y}" r="1.6" fill="${theme.faint}"/>`);
  rows.forEach(([when, title, detail], i) => {
    const y = top + i * ROW;
    parts.push(p.text(p.truncate(when, 2.4, 150), lineX - 24, y + 2, { pitch: 2.4, fill: theme.muted, anchor: "end" }).svg,
      i === 0 ? `<circle cx="${lineX}" cy="${y + 9}" r="7" fill="${theme.fg}"/>`
        : `<circle cx="${lineX}" cy="${y + 9}" r="6" fill="${theme.bg}" stroke="${theme.fg}" stroke-width="2"/>`,
      p.text(p.truncate(title, 3.0, W - x - 24), x, y, { pitch: 3.0, fill: theme.fg }).svg,
      detail ? words(theme, clip(detail, Math.floor((W - x - 24) / 7.8)), x, y + 44, { size: 13 }) : "");
  });
  return p.card(W, H, parts.join(""));
}

/** One feed entry (video / post): optional greyscale thumbnail, title, source and date. */
export function feedCard(p, theme, item, thumb) {
  const W = 430, H = 132, pad = 18;
  let x = pad, image = "";
  if (thumb) {
    const tw = 160, th = 90, ty = (H - th) / 2;
    image = `<defs><clipPath id="c"><rect x="${pad}" y="${ty}" width="${tw}" height="${th}" rx="${innerRadius(theme, pad)}"/></clipPath>` +
      `<filter id="g"><feColorMatrix type="saturate" values="0"/></filter></defs>` +
      `<image href="data:${thumb.mime};base64,${thumb.base64}" x="${pad}" y="${ty}" width="${tw}" height="${th}" ` +
      `preserveAspectRatio="xMidYMid slice" clip-path="url(#c)" filter="url(#g)"/>`;
    x = pad + tw + 16;
  }
  const maxW = W - x - pad, perLine = Math.floor(maxW / 7.9);
  const lines = wrapWords(item.title, perLine, 3);
  return p.card(W, H, image +
    p.text(p.truncate(item.source || "FEED", 2.2, maxW), x, 18, { pitch: 2.2, fill: theme.faint }).svg +
    lines.map((l, i) => words(theme, l, x, 54 + i * 18, { size: 13.5, fill: theme.fg })).join("") +
    p.text(item.date || "", x, H - 30, { pitch: 2.4, fill: theme.muted }).svg);
}

/** Twitch: LIVE (pulsing dot, stream title, game) or OFFLINE. */
export function liveCard(p, theme, live, channel, opt = {}) {
  const W = CARD_W, H = 96;
  const on = !!live?.live;
  const speed = animSpeed(theme, opt);
  const dot = on
    ? `<style>.d{animation:pulse ${n(1.6 / speed)}s ease-in-out infinite;transform-origin:44px 48px}@keyframes pulse{50%{opacity:.35;transform:scale(.8)}}` +
      `@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style><circle class="d" cx="44" cy="48" r="11" fill="${theme.fg}"/>`
    : `<circle cx="44" cy="48" r="11" fill="none" stroke="${theme.faint}" stroke-width="2.5"/>`;
  const state = p.text(on ? "LIVE" : "OFFLINE", 72, 24, { pitch: 4.4, fill: on ? theme.fg : theme.faint });
  const where = p.text(`TWITCH.TV/${channel}`, 72, 64, { pitch: 2.2, fill: theme.muted });
  const right = on
    ? words(theme, clip(live.title || "", 58), W - 24, 44, { size: 15, fill: theme.fg, anchor: "end" }) +
      p.text(p.truncate(live.game || "", 2.4, 400), W - 24, 58, { pitch: 2.4, fill: theme.muted, anchor: "end" }).svg
    : "";
  return p.card(W, H, dot + state.svg + where.svg + right);
}

/** Code snippet in a terminal-like window; comment lines dimmer. */
export function codeCard(p, theme, file, code) {
  const W = CARD_W, BAR = 40, LINE = 21, pad = 24;
  const lines = String(code).replace(/\t/g, "  ").split("\n").slice(0, 24).map((l) => clip(l.trimEnd(), 92));
  const H = BAR + 18 + lines.length * LINE + 12;
  const bar = [0, 1, 2].map((i) => `<circle cx="${pad + 6 + i * 20}" cy="${BAR / 2}" r="6" fill="${[theme.fg, theme.muted, theme.faint][i]}"/>`).join("") +
    p.text(p.truncate(file || "", 2.4, 500), W / 2, BAR / 2 - 8, { pitch: 2.4, fill: theme.muted, anchor: "middle" }).svg +
    `<rect y="${BAR}" x="1" width="${W - 2}" height="1" fill="${theme.edge.color}"${theme.edge.opacity < 1 ? ` fill-opacity="${theme.edge.opacity}"` : ""}/>`;
  const body = lines.map((l, i) => words(theme, l, pad, BAR + 30 + i * LINE,
    { size: 14, fill: /^\s*(\/\/|#|--|;)/.test(l) ? theme.faint : theme.fg })).join("");
  return p.card(W, H, bar + body);
}

/** Guestbook: latest entries (@login, date, text) and a "sign" line. */
export function guestbookCard(p, theme, entries) {
  const W = CARD_W, ROW = 58, pad = 24;
  const parts = entries.map((e, i) => {
    const y = 22 + i * ROW;
    return p.text(p.truncate(`@${e.login}`, 2.6, 500), pad, y, { pitch: 2.6, fill: theme.fg }).svg +
      p.text(e.date || "", W - pad, y, { pitch: 2.2, fill: theme.faint, anchor: "end" }).svg +
      words(theme, clip(e.text, 96), pad, y + 36, { size: 13.5 });
  });
  const y = 22 + entries.length * ROW;
  if (!entries.length) parts.push(p.text("NO ENTRIES YET - BE THE FIRST", pad, 24, { pitch: 2.8, fill: theme.faint }).svg);
  const yy = entries.length ? y : 64;
  const sign = p.text("SIGN THE GUESTBOOK >", pad + 16, yy + 12, { pitch: 2.6, fill: theme.bg });
  parts.push(`<rect x="${pad}" y="${yy}" width="${n(sign.w + 32)}" height="${n(sign.h + 24)}" rx="${n((sign.h + 24) / 2)}" fill="${theme.fg}"/>`, sign.svg);
  return p.card(W, yy + sign.h + 24 + 22, parts.join(""));
}

/** Visitor counter badge: label + number (used by tools/counter/server.mjs). */
export function counterSvg(p, theme, count, label = "VISITORS") {
  const H = 48, l = p.text(label || "VISITORS", 18, 0, { pitch: 2.4, fill: theme.muted });
  const num = p.text(String(count).padStart(6, "0"), 18 + l.w + 16, 0, { pitch: 3.2, fill: theme.fg });
  const W = Math.ceil(18 + l.w + 16 + num.w + 18);
  return p.card(W, H, `<g transform="translate(0 ${n((H - l.h) / 2)})">${l.svg}</g><g transform="translate(0 ${n((H - num.h) / 2)})">${num.svg}</g>`);
}

// -------------------------------------------- Module 4: Extended Metrics --

/** Spoken Languages (human languages + optional proficiency level and dot bar). */
export function spokenCard(p, theme, rows, style = "bars") {
  if (style === "cards") {
    const W = CARD_W, pad = 22, cols = 2, gap = 14, colW = (W - 2 * pad - gap) / cols;
    const parts = [];
    const numRows = Math.ceil(rows.length / cols);
    rows.forEach(([lang, level, pctStr], i) => {
      const col = i % cols, r = Math.floor(i / cols);
      const x = pad + col * (colW + gap), y = 20 + r * 72;
      const pct = Math.min(100, Math.max(0, Number(pctStr) || 0));
      parts.push(`<rect x="${n(x)}" y="${y}" width="${n(colW)}" height="58" rx="${innerRadius(theme, pad)}" fill="${theme.fill}" ${edge(theme, 1)}/>`);
      parts.push(p.text(p.truncate(lang, 3.0, colW - 28), x + 14, y + 12, { pitch: 3.0, fill: theme.fg }).svg);
      if (level) parts.push(p.text(p.truncate(level, 2.2, colW - 28), x + 14, y + 36, { pitch: 2.2, fill: theme.muted }).svg);
      if (pct > 0) parts.push(p.text(`${Math.round(pct)}%`, x + colW - 14, y + 14, { pitch: 2.4, fill: theme.faint, anchor: "end" }).svg);
    });
    return p.card(W, 20 + numRows * 72 + 8, parts.join(""));
  }
  const W = CARD_W, pad = 24, parts = [];
  let y = 24;
  for (const [lang, level, pctStr] of rows) {
    const pct = Math.min(100, Math.max(10, Number(pctStr) || 100));
    parts.push(p.text(p.truncate(lang, 3.0, 220), pad, y, { pitch: 3.0, fill: theme.fg }).svg);
    const dotsCount = 34, filled = Math.max(1, Math.round((pct / 100) * dotsCount));
    for (let k = 0; k < dotsCount; k++) {
      parts.push(`<circle cx="${260 + k * 11}" cy="${y + 9}" r="3.2" fill="${k < filled ? theme.fg : theme.dim}"/>`);
    }
    if (level) {
      parts.push(p.text(p.truncate(level, 2.4, 210), W - pad, y + 2, { pitch: 2.4, fill: theme.muted, anchor: "end" }).svg);
    }
    y += 36;
  }
  return p.card(W, y + 8, parts.join(""));
}

/** GitHub Followers showcase card. */
export function followersCard(p, theme, count, recent = [], limit = 6) {
  const W = CARD_W, pad = 24, parts = [];
  const num = p.text(short(count), pad, 24, { pitch: 5.5, fill: theme.fg });
  const lbl = p.text(count === 1 ? "GITHUB FOLLOWER" : "GITHUB FOLLOWERS", pad + num.w + 20, 38, { pitch: 3.0, fill: theme.muted });
  parts.push(num.svg, lbl.svg);

  const list = (recent || []).slice(0, limit);
  if (!list.length || limit <= 0) {
    return p.card(W, 92, parts.join(""));
  }
  let y = 84;
  parts.push(p.text("RECENT FOLLOWERS", pad, y, { pitch: 2.2, fill: theme.faint }).svg);
  y += 26;
  const cols = Math.min(3, Math.max(1, list.length));
  const gap = 12, colW = (W - 2 * pad - (cols - 1) * gap) / cols;
  list.forEach((f, idx) => {
    const c = idx % cols, r = Math.floor(idx / cols);
    const x0 = pad + c * (colW + gap), y0 = y + r * 52;
    const login = typeof f === "string" ? f : f.login || "user";
    parts.push(`<rect x="${n(x0)}" y="${y0}" width="${n(colW)}" height="42" rx="${innerRadius(theme, pad)}" fill="${theme.dim}" fill-opacity=".35" ${edge(theme, 1)}/>`);
    parts.push(`<circle cx="${n(x0 + 21)}" cy="${y0 + 21}" r="11" fill="${theme.dim}"/>`);
    parts.push(p.text(login[0] || "U", x0 + 21, y0 + 14, { pitch: 2.0, fill: theme.fg, anchor: "middle" }).svg);
    parts.push(p.text(p.truncate(`@${login}`, 2.4, colW - 52), x0 + 40, y0 + 13, { pitch: 2.4, fill: theme.fg }).svg);
  });
  const rowsCount = Math.ceil(list.length / cols);
  return p.card(W, y + rowsCount * 52 + 16, parts.join(""));
}

// ----------------------------------------- Module 3: Steam Profile Card --

const fmtHours = (mins) => {
  const h = (mins || 0) / 60;
  return h >= 100 ? `${Math.round(h)}H` : h >= 1 ? `${h.toFixed(1).replace(".0", "")}H` : `${Math.round(mins || 0)}M`;
};

/**
 * Steam Playtime card: shows filtered games with dot-matrix progress bars
 * and timeframe metrics (All-Time, Last 30 Days, Last 7 Days).
 */
export function steamCard(p, theme, games, opt) {
  const W = CARD_W, pad = 24, parts = [];
  const periodLabel = opt.period === "1w" ? "LAST 7 DAYS" : opt.period === "1m" ? "LAST 30 DAYS" : "ALL-TIME";
  const metricLabel = opt.metric === "both" ? `${periodLabel} + TOTAL` : opt.metric === "period" ? periodLabel : "TOTAL PLAYTIME";

  parts.push(p.text("STEAM", pad, 20, { pitch: 2.6, fill: theme.muted }).svg);
  parts.push(p.text(metricLabel, W - pad, 20, { pitch: 2.4, fill: theme.faint, anchor: "end" }).svg);

  let y = 56;
  if (!games.length) {
    parts.push(p.text("NO STEAM PLAYTIME DATA FOR THIS FILTER", pad, y + 8, { pitch: 3.0, fill: theme.faint }).svg);
    return p.card(W, y + 48, parts.join(""));
  }

  const valOf = (g) => (opt.period === "1w" ? g.week : opt.period === "1m" ? g.month : g.total) || 0;
  const maxVal = Math.max(1, ...games.map((g) => (opt.metric === "total" ? g.total : valOf(g) || g.total)));

  games.forEach((g, idx) => {
    const primary = opt.metric === "total" ? g.total : valOf(g);
    let rightText;
    if (opt.metric === "both") {
      rightText = opt.period === "all"
        ? `${fmtHours(g.total)}${g.week > 0 ? ` (+${fmtHours(g.week)} 7D)` : ""}`
        : `${fmtHours(valOf(g))} / ${fmtHours(g.total)}`;
    } else if (opt.metric === "period") {
      rightText = fmtHours(valOf(g));
    } else {
      rightText = fmtHours(g.total);
    }

    const rank = p.text(String(idx + 1).padStart(2, "0"), pad, y + 2, { pitch: 2.4, fill: theme.faint });
    const title = p.text(p.truncate(g.name, 2.8, 290), pad + 38, y, { pitch: 2.8, fill: theme.fg });
    parts.push(rank.svg, title.svg);

    const barX = 365, dotsCount = 26;
    const ratio = Math.min(1, Math.max(0, (primary || g.total) / maxVal));
    const filled = primary > 0 ? Math.max(1, Math.round(ratio * dotsCount)) : 0;
    for (let k = 0; k < dotsCount; k++) {
      parts.push(`<circle cx="${barX + k * 10.5}" cy="${y + 8}" r="3" fill="${k < filled ? theme.fg : theme.dim}"/>`);
    }

    parts.push(p.text(rightText, W - pad, y + 1, { pitch: 2.5, fill: theme.muted, anchor: "end" }).svg);
    y += 34;
  });

  return p.card(W, y + 12, parts.join(""));
}

// ------------------------------------ Module 2: Privacy-First Portfolio --

/**
 * Filter portfolio history by timeframe (ytd, 1w, 1m, 1y, custom).
 */
export function filterPortfolioHistory(history, period, customDays = 90) {
  if (!Array.isArray(history) || !history.length) return [];
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = sorted[sorted.length - 1].date;
  const yearStart = `${lastDate.slice(0, 4)}-01-01`;
  const shift = (days) => {
    const d = new Date(lastDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const cutoff = period === "1w" ? shift(7)
    : period === "1m" ? shift(30)
    : period === "1y" ? shift(365)
    : period === "custom" ? shift(Math.max(7, Number(customDays) || 90))
    : yearStart; // ytd default
  const filtered = sorted.filter((pt) => pt.date >= cutoff);
  return filtered.length >= 2 ? filtered : sorted.slice(-Math.min(sorted.length, 7));
}

/**
 * Render Portfolio Widget:
 *   - Allocation chart: donut, bar, or treemap (weights in %, never currency amounts)
 *   - Performance chart: chain-linked index (Start = 100), locked until >= 7 days of data exist
 *   - Supports linear (% change) and logarithmic (log) Y-axis scaling
 */
export function portfolioCard(p, theme, allocations, history, opt) {
  const W = CARD_W, pad = 24, parts = [];
  const shades = [theme.fg, theme.muted, theme.faint, theme.dim];
  const opacities = [1, 0.78, 0.58, 0.42, 0.3, 0.22];

  // Top section: Allocation visualization (left + legend)
  parts.push(p.text("ASSET ALLOCATION (WEIGHT %)", pad, 20, { pitch: 2.5, fill: theme.muted }).svg);
  parts.push(p.text(`CHART: ${opt.chart.toUpperCase()}`, W - pad, 20, { pitch: 2.2, fill: theme.faint, anchor: "end" }).svg);

  let y = 52;
  if (opt.chart === "bar") {
    // Stacked horizontal bar + legend
    const barW = W - 2 * pad, barH = 26;
    let bx = pad;
    allocations.forEach((a, i) => {
      const w = Math.max(2, (a.weight / 100) * barW);
      const op = opacities[i % opacities.length];
      parts.push(`<rect x="${n(bx)}" y="${y}" width="${n(w)}" height="${barH}" fill="${theme.fg}" fill-opacity="${op}" stroke="${theme.bg}" stroke-width="1.5"/>`);
      bx += w;
    });
    y += barH + 18;
    const cols = 3, colW = (W - 2 * pad) / cols;
    allocations.forEach((a, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const lx = pad + c * colW, ly = y + r * 28;
      const op = opacities[i % opacities.length];
      parts.push(`<rect x="${n(lx)}" y="${ly + 2}" width="12" height="12" rx="3" fill="${theme.fg}" fill-opacity="${op}"/>`);
      parts.push(p.text(p.truncate(`${a.label} (${a.weight.toFixed(1).replace(".0", "")}%)`, 2.4, colW - 24), lx + 20, ly, { pitch: 2.4, fill: theme.fg }).svg);
    });
    y += Math.ceil(allocations.length / cols) * 28 + 10;
  } else if (opt.chart === "treemap") {
    // Proportional 2D Treemap strip layout
    const mapW = W - 2 * pad, mapH = 112;
    let tx = pad;
    allocations.forEach((a, i) => {
      const w = Math.max(24, (a.weight / 100) * mapW);
      const op = opacities[i % opacities.length];
      parts.push(`<rect x="${n(tx)}" y="${y}" width="${n(Math.max(1, w - 3))}" height="${mapH}" rx="${innerRadius(theme, pad)}" fill="${theme.fg}" fill-opacity="${op * 0.25}" stroke="${theme.fg}" stroke-opacity="${op}"/>`);
      if (w >= 72) {
        parts.push(p.text(p.truncate(a.ticker, 2.6, w - 16), tx + 10, y + 14, { pitch: 2.6, fill: theme.fg }).svg);
        parts.push(p.text(`${a.weight.toFixed(1).replace(".0", "")}%`, tx + 10, y + 42, { pitch: 3.0, fill: theme.muted }).svg);
        if (w >= 120) parts.push(p.text(p.truncate(a.label, 2.0, w - 16), tx + 10, y + 82, { pitch: 2.0, fill: theme.faint }).svg);
      }
      tx += w;
    });
    y += mapH + 18;
  } else {
    // Donut chart (default) on the left + allocation table on the right
    const cx = pad + 72, cy = y + 68, R = 54, C = 2 * Math.PI * R;
    let offset = 0;
    allocations.forEach((a, i) => {
      const len = (a.weight / 100) * C;
      const op = opacities[i % opacities.length];
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${theme.fg}" stroke-opacity="${op}" stroke-width="18" ` +
        `stroke-dasharray="${n(Math.max(0, len - 2))} ${n(C)}" stroke-dashoffset="${n(-offset)}" transform="rotate(-90 ${cx} ${cy})"/>`);
      offset += len;
    });
    const countTxt = p.text(`${allocations.length}`, cx, cy - 14, { pitch: 3.4, fill: theme.fg, anchor: "middle" });
    const subTxt = p.text("ASSETS", cx, cy + 12, { pitch: 1.9, fill: theme.faint, anchor: "middle" });
    parts.push(countTxt.svg, subTxt.svg);

    const listX = pad + 172, listW = W - listX - pad;
    allocations.slice(0, 6).forEach((a, i) => {
      const ly = y + 4 + i * 24;
      const op = opacities[i % opacities.length];
      parts.push(`<rect x="${listX}" y="${ly + 2}" width="10" height="10" rx="2" fill="${theme.fg}" fill-opacity="${op}"/>`);
      parts.push(p.text(p.truncate(`${a.ticker} · ${a.label}`, 2.4, 280), listX + 18, ly, { pitch: 2.4, fill: theme.fg }).svg);
      const dots = 18, filled = Math.max(1, Math.round((a.weight / 100) * dots));
      for (let k = 0; k < dots; k++) {
        parts.push(`<circle cx="${listX + 315 + k * 9}" cy="${ly + 7}" r="2.4" fill="${k < filled ? theme.fg : theme.dim}"/>`);
      }
      parts.push(p.text(`${a.weight.toFixed(1).replace(".0", "")}%`, W - pad, ly, { pitch: 2.4, fill: theme.muted, anchor: "end" }).svg);
    });
    y += Math.max(146, allocations.slice(0, 6).length * 24 + 16);
  }

  // Performance section (with mandatory 7-day lock threshold)
  if (opt.show_performance === "on") {
    parts.push(`<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" ${edge(theme, 1)} stroke-dasharray="4 4"/>`);
    y += 18;

    const totalDays = Array.isArray(history) ? history.length : 0;
    const periodNames = { ytd: "YTD", "1w": "LAST WEEK", "1m": "LAST MONTH", "1y": "LAST YEAR", custom: `LAST ${opt.custom_days}D` };
    const pName = periodNames[opt.period] || "YTD";
    const scaleName = opt.scale === "log" ? "LOG SCALE" : "LINEAR (%)";

    parts.push(p.text(`PERFORMANCE INDEX (${pName} · ${scaleName})`, pad, y, { pitch: 2.4, fill: theme.muted }).svg);

    if (totalDays < 7) {
      // 7-Day Lock: do not show the performance graph until at least 7 days of history exist
      y += 28;
      parts.push(`<rect x="${pad}" y="${y}" width="${W - 2 * pad}" height="82" rx="${innerRadius(theme, pad)}" fill="${theme.dim}" fill-opacity=".22" ${edge(theme, 1)}/>`);
      const lockMsg = p.text(`7-DAY THRESHOLD LOCK: COLLECTING HISTORY (${totalDays}/7 DAYS)`, W / 2, y + 22, { pitch: 2.6, fill: theme.fg, anchor: "middle" });
      const subMsg = p.text("PERFORMANCE GRAPH UNLOCKS AUTOMATICALLY AFTER 7 DAILY SNAPSHOTS", W / 2, y + 50, { pitch: 2.0, fill: theme.faint, anchor: "middle" });
      parts.push(lockMsg.svg, subMsg.svg);
      y += 96;
    } else {
      const series = filterPortfolioHistory(history, opt.period, opt.custom_days);
      const baseIdx = series[0]?.index || 100;
      const lastIdx = series[series.length - 1]?.index || 100;
      const relPct = ((lastIdx - baseIdx) / baseIdx) * 100;
      const sign = relPct >= 0 ? "+" : "";
      parts.push(p.text(`${sign}${relPct.toFixed(2)}% (IDX ${lastIdx.toFixed(1)})`, W - pad, y, { pitch: 2.6, fill: theme.fg, anchor: "end" }).svg);
      y += 28;

      const gx = pad + 56, gy = y, gw = W - gx - pad, gh = 116;
      const vals = series.map((pt) => opt.scale === "log" ? Math.log10(Math.max(1e-3, pt.index)) : ((pt.index - baseIdx) / baseIdx) * 100);
      const minV = Math.min(...vals), maxV = Math.max(...vals);
      const span = maxV - minV || 1;

      // Grid lines + Y-axis labels
      for (const t of [0, 0.5, 1]) {
        const ly = gy + gh - t * gh;
        const v = minV + t * span;
        const label = opt.scale === "log" ? `${Math.pow(10, v).toFixed(1)}` : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
        parts.push(`<line x1="${gx}" y1="${n(ly)}" x2="${gx + gw}" y2="${n(ly)}" stroke="${theme.dim}" stroke-dasharray="3 3"/>`);
        parts.push(p.text(label, gx - 8, ly - 6, { pitch: 1.9, fill: theme.faint, anchor: "end" }).svg);
      }

      const coords = series.map((pt, i) => {
        const px = gx + (i / Math.max(1, series.length - 1)) * gw;
        const py = gy + gh - ((vals[i] - minV) / span) * (gh - 12) - 6;
        return [px, py];
      });
      const poly = coords.map(([px, py]) => `${n(px)},${n(py)}`).join(" ");
      const area = `${n(gx)},${n(gy + gh)} ${poly} ${n(gx + gw)},${n(gy + gh)}`;
      parts.push(`<polygon points="${area}" fill="${theme.fg}" fill-opacity=".12"/>`);
      parts.push(`<polyline points="${poly}" fill="none" stroke="${theme.fg}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);

      parts.push(p.text(series[0].date, gx, gy + gh + 8, { pitch: 1.9, fill: theme.faint }).svg);
      parts.push(p.text(series[series.length - 1].date, gx + gw, gy + gh + 8, { pitch: 1.9, fill: theme.faint, anchor: "end" }).svg);
      y += gh + 28;
    }
  }

  return p.card(W, y + 6, parts.join(""));
}

/** Dot-matrix text as a standalone SVG (used for the editor's own headings). */
export function renderLabel(theme, font, str, { pitch = 2.6, fill = theme.fg } = {}) {
  const t = painter(theme, font).text(str, 0, 0, { pitch, fill });
  return svgDoc(n(t.w + 2), n(t.h), t.svg);
}

/** One icon tile as SVG text (used by the editor's icon picker). */
export const renderTile = (theme, font, icon) => tile(painter(theme, font), theme, icon).svg;

// ---------------------------------------------------------------- images --

/** Width/height from PNG, JPEG, GIF or WebP bytes (Uint8Array), without decoding. */
export function imageSize(b) {
  const u16 = (i) => (b[i] << 8) | b[i + 1], le16 = (i) => b[i] | (b[i + 1] << 8);
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: le16(6), height: le16(8), mime: "image/gif" };
  if (b[0] === 0x89 && b[1] === 0x50) return { width: (u16(16) << 16) | u16(18), height: (u16(20) << 16) | u16(22), mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8) { // JPEG: walk the segments to the SOF marker
    for (let i = 2; i < b.length;) {
      const marker = b[i + 1], len = u16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { width: u16(i + 7), height: u16(i + 5), mime: "image/jpeg" };
      i += 2 + len;
    }
  }
  if (String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === "VP8 ") return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff, mime: "image/webp" };
    if (kind === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mime: "image/webp" };
    }
    if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), mime: "image/webp" };
  }
  throw new Error("unsupported image format (use png, jpg, gif or webp)");
}
