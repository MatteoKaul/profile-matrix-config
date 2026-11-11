// External data, reduced to what the modules draw. Pure functions (no
// network), used by fetch.mjs, live.mjs, market.mjs and steam.mjs and
// testable with saved responses.

/** Feed source as written in settings -> feed URL (or a YouTube handle to look up). */
export function feedUrl(source) {
  const yt = source.match(/^youtube:(.+)$/i);
  if (!yt) return /^https:\/\//i.test(source) ? { url: source } : { error: "use https:// or youtube:<channel id / @handle>" };
  const id = yt[1].trim();
  if (/^UC[\w-]{22}$/.test(id)) return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` };
  if (/^@[\w.-]+$/.test(id)) return { handle: id };
  return { error: "youtube: needs a channel id (UC...) or @handle" };
}

/** Channel id from the HTML of a YouTube channel page (youtube.com/@handle). */
export const youtubeChannelId = (html) =>
  (html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) || html.match(/channel_id=(UC[\w-]{22})/) || [])[1] || null;

const plain = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === "#"
    ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10))
    : ENTITIES[e.toLowerCase()] ?? m);
// Element text: CDATA unwrapped, tags removed, then entities decoded (so "&lt;b&gt;" stays as text).
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(plain(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))) : "";
};
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\s[^>]*?${a}="([^"]*)"`, "i")); return m ? decode(m[1]) : ""; };

/**
 * RSS 2.0 or Atom (incl. YouTube) -> [{title, url, date, thumb, source}].
 * thumb is the image URL here; fetch.mjs downloads it and puts the local path in.
 */
export function parseFeed(xml, label) {
  const atom = /<feed[\s>]/i.test(xml);
  const blocks = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    const url = atom ? (attr(b, 'link[^>]*rel="alternate"', "href") || attr(b, "link", "href")) : tag(b, "link") || tag(b, "guid");
    const date = new Date(tag(b, atom ? "published" : "pubDate") || tag(b, "updated") || tag(b, "dc:date"));
    const thumb = attr(b, "media:thumbnail", "url") || attr(b, 'media:content[^>]*medium="image"', "url") ||
      attr(b, 'enclosure[^>]*type="image/[^"]*"', "url") || (b.match(/<img[^>]+src="(https:[^"]+)"/i) || [])[1] || "";
    return { title: tag(b, "title"), url, date: isNaN(date) ? "" : date.toISOString().slice(0, 10), thumb, source: label };
  }).filter((i) => i.title && /^https?:\/\//i.test(i.url));
}

/** Label shown on feed cards: YOUTUBE or the site's host name. */
export const feedLabel = (url) => (/youtube\.com/i.test(url) ? "YOUTUBE" : new URL(url).hostname.replace(/^www\./, "").toUpperCase());

/** GraphQL gist node -> card data (same fields as a repo card). */
export const gistCard = (g) => ({
  name: g.files?.[0]?.name || g.name, description: g.description || "", url: g.url,
  language: g.files?.[0]?.language?.name || "", stars: g.stargazerCount || 0,
});

/**
 * Issue comments -> guestbook entries. A comment counts as approved when the
 * repo owner reacted to it with a thumbs up (or wrote it).
 */
export function guestbookEntries(comments, owner) {
  return comments.map((c) => ({
    login: c.author?.login || "ghost",
    // first 140 characters as plain text: no code blocks, images, HTML or Markdown marks
    text: plain(c.body.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/^\s*>+/gm, ""))
      .replace(/[*_`#]/g, "").slice(0, 140),
    date: c.createdAt.slice(0, 10),
    approved: c.author?.login?.toLowerCase() === owner.toLowerCase() ||
      c.reactions.nodes.some((r) => r.user?.login?.toLowerCase() === owner.toLowerCase()),
  })).filter((e) => e.text).reverse(); // newest first
}

/** Twitch Helix /streams response -> {login: {live, title, game, startedAt}} for the asked channels. */
export function liveState(channels, streams) {
  const by = Object.fromEntries(streams.map((s) => [s.user_login.toLowerCase(), s]));
  return Object.fromEntries(channels.map((c) => {
    const s = by[c.toLowerCase()];
    return [c.toLowerCase(), s ? { live: true, title: s.title, game: s.game_name, startedAt: s.started_at } : { live: false }];
  }));
}

// --------------------------------------------------- Portfolio Chain-Link --

/**
 * Time-Weighted Return (Chain-Linking) for the Privacy-First Portfolio Tracker.
 *
 * Ensures that when the user rebalances or updates their asset weights in
 * settings.txt, the entire existing index curve (starting at 100.00) remains
 * 100% intact. Any new daily return is computed using the current normalized
 * weights and linked onto the last historical index value:
 *
 *   r_t = sum_i ( w_i * (P_{i,t} - P_{i,t-1}) / P_{i,t-1} )
 *   Index_t = Index_{t-1} * (1 + r_t)
 *
 * @param {object} existing  Previous data/portfolio.json ({ history: [{date, index}], lastPrices: {ticker: price} })
 * @param {Array<{ticker: string, weight: number}>} allocations  Current normalized weights (sum = 100)
 * @param {Record<string, Record<string, number>>} priceSeriesByTicker  { ticker: { "YYYY-MM-DD": closePrice } }
 * @returns {object} Updated portfolio state (never contains absolute user currency values)
 */
export function updatePortfolioHistory(existing, allocations, priceSeriesByTicker) {
  const history = Array.isArray(existing?.history) ? [...existing.history].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const weights = Object.fromEntries(allocations.map((a) => [a.ticker.toUpperCase(), a.weight / 100]));
  const tickers = Object.keys(weights);
  // Nothing new (no tickers, or every price request failed): keep the stored state
  // exactly as it is, including lastPrices, so the next good day chains on correctly.
  const unchanged = () => ({ updatedAt: existing?.updatedAt || null, history, lastPrices: { ...(existing?.lastPrices || {}) } });
  if (!tickers.length) return unchanged();

  // Collect all sorted dates available in the fetched price series
  const allDates = [...new Set(tickers.flatMap((t) => Object.keys(priceSeriesByTicker[t] || {})))].sort();
  if (!allDates.length) return unchanged();

  // Forward-fill missing weekend/holiday prices per ticker across allDates
  const filled = {};
  for (const t of tickers) {
    filled[t] = {};
    let last = existing?.lastPrices?.[t] ?? null;
    for (const d of allDates) {
      if (priceSeriesByTicker[t]?.[d] > 0) last = priceSeriesByTicker[t][d];
      if (last > 0) filled[t][d] = last;
    }
  }

  // If no history exists yet, initialize at 100.00 on the first date where at least one asset has a price
  if (!history.length) {
    const firstDate = allDates.find((d) => tickers.some((t) => filled[t][d] > 0));
    if (!firstDate) return unchanged();
    history.push({ date: firstDate, index: 100 });
  }

  const lastEntry = () => history[history.length - 1];
  const startDate = lastEntry().date;

  // Chain-link each subsequent date strictly after the last recorded date
  for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];
    if (date <= startDate) continue;
    const prevDate = allDates[i - 1] || startDate;

    let weightedReturn = 0;
    let activeWeightSum = 0;
    for (const t of tickers) {
      const pPrev = filled[t]?.[prevDate] ?? existing?.lastPrices?.[t];
      const pCurr = filled[t]?.[date];
      if (pPrev > 0 && pCurr > 0) {
        weightedReturn += weights[t] * ((pCurr - pPrev) / pPrev);
        activeWeightSum += weights[t];
      }
    }
    // Normalize if a newly added ticker didn't have a price yesterday
    const dailyReturn = activeWeightSum > 0 ? weightedReturn / activeWeightSum : 0;
    const nextIndex = +(lastEntry().index * (1 + dailyReturn)).toFixed(4);
    history.push({ date, index: nextIndex });
  }

  const latestDate = allDates[allDates.length - 1];
  const lastPrices = { ...(existing?.lastPrices || {}) };
  for (const t of tickers) {
    if (filled[t]?.[latestDate] > 0) lastPrices[t] = filled[t][latestDate];
  }

  return {
    updatedAt: latestDate || new Date().toISOString().slice(0, 10),
    lastPrices,
    history: history.slice(-1825), // keep up to 5 years of daily points
  };
}

// --------------------------------------------------- Steam Snapshot Logic --

/**
 * Update daily Steam playtime snapshots and compute exact deltas for
 * Last Week (7 days) and Last Month (30 days).
 *
 * Steam's GetOwnedGames only returns `playtime_forever` and `playtime_2weeks` (in minutes).
 * By storing a lightweight daily snapshot of `playtime_forever`, we can compute exact
 * 7-day and 30-day deltas.
 *
 * @param {object} existing  Previous data/steam.json ({ snapshots: [{date, playtimes: {appid: min}}], games: [] })
 * @param {Array<{appid: number, name: string, playtime_forever: number, playtime_2weeks?: number}>} apiGames
 * @param {string} today     "YYYY-MM-DD"
 * @returns {object} Updated steam state with games[{appid, name, total, week, month}] (in minutes)
 */
export function updateSteamSnapshots(existing, apiGames, today = new Date().toISOString().slice(0, 10)) {
  const snapshots = Array.isArray(existing?.snapshots)
    ? existing.snapshots.filter((s) => s.date && s.date !== today).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // Record today's snapshot (only games with > 0 forever playtime to keep file tiny)
  const currentMap = {};
  for (const g of apiGames) {
    if (g.playtime_forever > 0) currentMap[g.appid] = g.playtime_forever;
  }
  snapshots.push({ date: today, playtimes: currentMap });

  // Prune snapshots older than 40 days
  const cutoff = shiftDays(today, -40);
  const keptSnapshots = snapshots.filter((s) => s.date >= cutoff);

  // Find snapshot closest to (and <=) target date, or oldest available snapshot if history < N days
  const findBaseline = (daysAgo) => {
    const target = shiftDays(today, -daysAgo);
    const candidates = keptSnapshots.filter((s) => s.date <= target);
    if (candidates.length) return candidates[candidates.length - 1];
    return keptSnapshots.length > 1 ? keptSnapshots[0] : null;
  };

  const snap7 = findBaseline(7);
  const snap30 = findBaseline(30);
  const has7dHistory = keptSnapshots.some((s) => s.date <= shiftDays(today, -5));
  const has30dHistory = keptSnapshots.some((s) => s.date <= shiftDays(today, -15));

  const games = apiGames
    .filter((g) => g.playtime_forever > 0 || g.playtime_2weeks > 0)
    .map((g) => {
      const total = g.playtime_forever || 0;
      const twoWeeks = g.playtime_2weeks || 0;
      // Exact delta from snapshot if available; graceful fallback while history builds up
      const delta7 = snap7 ? Math.max(0, total - (snap7.playtimes[g.appid] ?? total)) : 0;
      const delta30 = snap30 ? Math.max(0, total - (snap30.playtimes[g.appid] ?? total)) : 0;
      const week = has7dHistory ? delta7 : Math.max(delta7, Math.round(twoWeeks / 2));
      const month = has30dHistory ? delta30 : Math.max(delta30, twoWeeks);
      return {
        appid: g.appid,
        name: g.name || `App ${g.appid}`,
        total,
        week,
        month,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    updatedAt: today,
    games,
    snapshots: keptSnapshots,
  };
}

function shiftDays(isoDate, deltaDays) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
