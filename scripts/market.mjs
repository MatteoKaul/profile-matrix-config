// Fetch End-of-Day (EOD) market prices and update the chain-linked
// portfolio index in data/portfolio.json (Module 2: Privacy-First Portfolio).
//
//   MARKET_API_KEY=... node scripts/market.mjs
//
// Zero-Knowledge guarantee:
//   - Only relative asset weights (%) from settings.txt are read.
//   - Only the normalized index (starting at 100.00) and EOD reference prices
//     are stored in data/portfolio.json.
//   - When asset weights change (rebalancing), existing historical index points
//     are preserved 100% intact and new daily returns are chain-linked onto the
//     latest index value (Time-Weighted Return principle).
//
// Providers (portfolio.provider); MARKET_API_KEY is the key of the chosen one:
//   - yahoo         no key; unofficial endpoint, can be blocked or change
//   - tiingo        key; US stocks/ETFs only, dividend-adjusted closes
//   - eodhd         key; also European exchanges (VWCE.DE is asked as VWCE.XETRA)
//   - alphavantage  key; 25 requests a day on the free plan
//   - stooq         key (since 2026, from stooq.com via a CAPTCHA form)
// A ticker that fails keeps its last price, so one bad day never breaks the index.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { updatePortfolioHistory } from "./lib/sources.mjs";
import { loadConfig } from "./lib/config.mjs";
import { splitPortfolio } from "./render.mjs";
import { optionalStep } from "./lib/optional.mjs";

optionalStep("market"); // a failure warns and keeps the old data, the build goes on

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data/portfolio.json");
const { MARKET_API_KEY: apiKey } = process.env;

const cfg = loadConfig(ROOT);
const modules = cfg.modules.filter((m) => m.type === "portfolio");

const allocations = modules.flatMap((m) => splitPortfolio(m.opt.allocations));
if (!allocations.length) {
  console.log("market: no portfolio allocations configured, skipped");
  process.exit(0);
}

const provider = modules[0]?.opt.provider || "yahoo";
const existing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { history: [], lastPrices: {} };
const hasHistory = Array.isArray(existing.history) && existing.history.length > 0;
const DAYS = hasHistory ? 14 : 35; // a few days more than needed, so missed runs are filled in
const UA = { "User-Agent": "Mozilla/5.0 (compatible; profile-matrix)" };

/** Fetch recent daily close prices { "YYYY-MM-DD": closePrice } for `ticker`. */
async function fetchSeries(ticker, prov) {
  if (prov !== "yahoo" && !apiKey) throw new Error(`repository secret MARKET_API_KEY is required for provider ${prov}`);
  if (prov === "tiingo") {
    // Tiingo only knows US listings; dropping ".DE" would silently price another security.
    if (ticker.includes(".")) throw new Error("Tiingo has US listings only; use provider eodhd or yahoo for exchange suffixes");
    const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}/prices?startDate=${shiftDays(-DAYS)}&token=${encodeURIComponent(apiKey)}`;
    const rows = await getJson(url, "Tiingo");
    return Object.fromEntries(rows.map((r) => [String(r.date).slice(0, 10), Number(r.adjClose || r.close)]).filter(([, p]) => p > 0));
  }
  if (prov === "eodhd") {
    const sym = ticker.includes(".") ? ticker.replace(/\.DE$/i, ".XETRA") : `${ticker}.US`;
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(sym)}?from=${shiftDays(-DAYS)}&fmt=json&api_token=${encodeURIComponent(apiKey)}`;
    const rows = await getJson(url, "EODHD");
    return Object.fromEntries(rows.map((r) => [r.date, Number(r.adjusted_close || r.close)]).filter(([, p]) => p > 0));
  }
  if (prov === "alphavantage") {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
    const data = await getJson(url, "Alpha Vantage");
    if (!data["Time Series (Daily)"]) throw new Error(`Alpha Vantage: ${data.Note || data.Information || data["Error Message"] || "no data"}`);
    return Object.fromEntries(Object.entries(data["Time Series (Daily)"]).slice(0, DAYS).map(([d, v]) => [d, Number(v["4. close"])]).filter(([, p]) => p > 0));
  }
  if (prov === "stooq") {
    const sym = ticker.includes(".") ? ticker.toLowerCase() : `${ticker.toLowerCase()}.us`;
    const res = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d&d1=${shiftDays(-DAYS).replace(/-/g, "")}&apikey=${encodeURIComponent(apiKey)}`, { headers: UA });
    if (!res.ok) throw new Error(`Stooq ${res.status}`);
    const csv = await res.text();
    if (!/^Date,/i.test(csv)) throw new Error(`Stooq: ${csv.slice(0, 80).replace(/\s+/g, " ")} (key missing or limit reached?)`);
    const out = {};
    for (const line of csv.trim().split(/\r?\n/).slice(1)) {
      const [date, , , , close] = line.split(",");
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number(close) > 0) out[date] = Number(close);
    }
    return out;
  }
  if (prov !== "yahoo") throw new Error(`unknown provider ${prov}`);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${hasHistory ? "1mo" : "3mo"}&interval=1d`;
  const result = (await getJson(url, "Yahoo"))?.chart?.result?.[0];
  const ts = result?.timestamp || [], closes = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote?.[0]?.close || [];
  const out = {};
  ts.forEach((t, i) => { if (Number(closes[i]) > 0) out[new Date(t * 1000).toISOString().slice(0, 10)] = Number(closes[i]); });
  return out;
}

async function getJson(url, name) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${name} ${res.status}`); // the URL is never logged: it can contain the key
  return res.json();
}

function shiftDays(delta) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const uniqueTickers = [...new Set(allocations.map((a) => a.ticker.toUpperCase()))];
const priceSeriesByTicker = {};
for (const ticker of uniqueTickers) {
  try {
    priceSeriesByTicker[ticker] = await fetchSeries(ticker, provider);
  } catch (err) {
    console.warn(`market: could not fetch ${ticker}: ${err.message}`);
  }
}

// Merge weights across first portfolio module and chain-link onto existing index
const primaryAllocations = splitPortfolio(modules[0].opt.allocations);
const updated = updatePortfolioHistory(existing, primaryAllocations, priceSeriesByTicker);

mkdirSync(dirname(FILE), { recursive: true });
const text = JSON.stringify(updated, null, 1) + "\n";
const before = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
if (text !== before) writeFileSync(FILE, text);
console.log(`market: ${updated.history.length} index points (latest: ${updated.history[updated.history.length - 1]?.index ?? "n/a"})`);
