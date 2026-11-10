// Fetch everything the profile shows from outside the repo:
//   GitHub (GraphQL)   followers, recent followers, commits, pinned repos and gists,
//                      repos, contributed repos, releases, guestbook -> data/github.json
//   avatars            for "gh:<login>" people images      -> data/avatars/<login>
//   RSS / Atom feeds   for feed modules (+ thumbnails)      -> data/feeds.json, data/thumbs/
//
//   GITHUB_TOKEN=... GH_USER=octocat node scripts/fetch.mjs
//
// Run daily by the workflow before build.mjs. The built-in workflow token is
// enough, only public data is read. The files are committed so builds (and
// the editor preview) work without network access. Images are stored
// without extension; their type is read from the bytes.
// Feeds, avatars and the guestbook are optional: if one fails, a warning is
// printed and the last fetched version stays.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feedLabel, feedUrl, gistCard, guestbookEntries, parseFeed, youtubeChannelId } from "./lib/sources.mjs";
import { loadConfig } from "./lib/config.mjs";
import { avatarLogins, imageSize, splitList } from "./render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = (p) => join(ROOT, p);
const { GITHUB_TOKEN, GH_USER } = process.env;
if (!GITHUB_TOKEN || !GH_USER) throw new Error("set GITHUB_TOKEN and GH_USER");
// The profile repo (owner/name); the workflow sets GITHUB_REPOSITORY.
const REPO = process.env.GITHUB_REPOSITORY || `${GH_USER}/${GH_USER}`;
const cfg = loadConfig(ROOT);
const modules = (type) => cfg.modules.filter((m) => m.type === type); // shown and hidden ones
const readJson = (p, fallback) => (existsSync(path(p)) ? JSON.parse(readFileSync(path(p), "utf8")) : fallback);
const UA = { "User-Agent": "profile-readme (github.com/" + REPO + ")" };

// ---------------------------------------------------------------- GitHub --

const GIST = "name description url stargazerCount files(limit: 1) { name language { name } }";
const QUERY = `
query($login: String!) {
  user(login: $login) {
    followers(first: 12) { totalCount nodes { login } }
    pinnedItems(first: 6, types: [REPOSITORY, GIST]) { nodes { __typename ... on Repository { name } ... on Gist { ${GIST} } } }
    gists(first: 12, privacy: PUBLIC, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ${GIST} } }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar { totalContributions weeks { contributionDays { contributionLevel } } }
    }
    repositoriesContributedTo(first: 12, privacy: PUBLIC, includeUserRepositories: false, orderBy: {field: STARGAZERS, direction: DESC}, contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY]) {
      nodes {
        nameWithOwner description url isFork stargazerCount pushedAt
        primaryLanguage { name }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name description url isFork stargazerCount pushedAt
        primaryLanguage { name }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } }
        latestRelease { tagName url publishedAt }
      }
    }
  }
}`;

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${GITHUB_TOKEN}`, ...UA },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await res.json();
  if (!res.ok || payload.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(payload.errors || payload)}`);
  return payload.data;
}

const u = (await graphql(QUERY, { login: GH_USER })).user;
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const cal = u.contributionsCollection.contributionCalendar;

// Reduced to what render.mjs uses; the format matches SAMPLE_DATA there.
const data = {
  login: GH_USER,
  repo: REPO,
  fetchedAt: new Date().toISOString(),
  followers: u.followers.totalCount,
  recentFollowers: (u.followers.nodes || []).map((f) => ({ login: f.login })),
  commits: u.contributionsCollection.totalCommitContributions,
  pinned: u.pinnedItems.nodes.filter((n) => n.__typename === "Repository").map((r) => r.name),
  gists: {
    pinned: u.pinnedItems.nodes.filter((n) => n.__typename === "Gist").map(gistCard),
    recent: u.gists.nodes.map(gistCard),
  },
  calendar: { total: cal.totalContributions, weeks: cal.weeks.map((w) => w.contributionDays.map((d) => LEVEL[d.contributionLevel])) },
  repos: u.repositories.nodes.map((r) => ({
    name: r.name,
    description: r.description,
    url: r.url,
    fork: r.isFork,
    stars: r.stargazerCount,
    pushedAt: r.pushedAt,
    language: r.primaryLanguage?.name || "",
    languages: Object.fromEntries(r.languages.edges.map((e) => [e.node.name, e.size])),
    release: r.latestRelease && { tag: r.latestRelease.tagName, url: r.latestRelease.url, date: r.latestRelease.publishedAt.slice(0, 10) },
  })),
  contributed: (u.repositoriesContributedTo?.nodes || []).map((r) => ({
    name: r.nameWithOwner,
    description: r.description,
    url: r.url,
    fork: r.isFork,
    stars: r.stargazerCount,
    pushedAt: r.pushedAt,
    language: r.primaryLanguage?.name || "",
  })),
};

// Also fetch any extra external owner/repo listed in contributed.repos
const extraContributed = [...new Set(modules("contributed")
  .flatMap((m) => splitList(m.opt.repos))
  .filter((x) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x) &&
    !data.contributed.some((c) => c.name.toLowerCase() === x.toLowerCase())))];

for (const full of extraContributed) {
  const [owner, name] = full.split("/");
  try {
    const r = (await graphql(`query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        nameWithOwner description url isFork stargazerCount pushedAt primaryLanguage { name }
      }
    }`, { owner, name })).repository;
    if (r) {
      data.contributed.push({
        name: r.nameWithOwner, description: r.description, url: r.url,
        fork: r.isFork, stars: r.stargazerCount, pushedAt: r.pushedAt,
        language: r.primaryLanguage?.name || "",
      });
    }
  } catch (err) {
    console.warn(`contributed ${full}: ${err.message}`);
  }
}

// Guestbook: comments of the configured issue in the profile repo.
const issue = modules("guestbook").map((m) => m.opt.issue).find((n) => n > 0);
if (issue) {
  const [owner, name] = REPO.split("/");
  try {
    const r = await graphql(`query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { issue(number: $n) {
      comments(last: 30) { nodes { author { login } body createdAt reactions(content: THUMBS_UP, first: 50) { nodes { user { login } } } } } } } }`,
    { owner, name, n: issue });
    if (!r.repository?.issue) throw new Error(`issue #${issue} not found in ${REPO}`);
    data.guestbook = { issue, entries: guestbookEntries(r.repository.issue.comments.nodes, GH_USER) };
  } catch (err) {
    console.warn(`guestbook: ${err.message}`);
    data.guestbook = readJson("data/github.json", {}).guestbook;
  }
}

mkdirSync(path("data"), { recursive: true });
writeFileSync(path("data/github.json"), JSON.stringify(data, null, 1) + "\n");

// ------------------------------------------------------------- downloads --

/** GET bytes (max 2 MB), for avatars and thumbnails. */
async function download(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > 2e6) throw new Error("larger than 2 MB");
  imageSize(bytes); // throws for anything that is not png/jpg/gif/webp
  return bytes;
}

/** Keep only `keep` (file names) in a data/ folder. */
function prune(dir, keep) {
  for (const f of existsSync(path(dir)) ? readdirSync(path(dir)) : []) if (!keep.includes(f)) rmSync(path(`${dir}/${f}`));
}

// Avatars for people cards ("gh:<login>" images, also of hidden modules so
// they are ready when a module is switched on).
const logins = avatarLogins(cfg);
mkdirSync(path("data/avatars"), { recursive: true });
for (const login of logins) {
  try { writeFileSync(path(`data/avatars/${login}`), await download(`https://avatars.githubusercontent.com/${login}?s=112`)); }
  catch (err) { console.warn(`avatar ${login}: ${err.message}`); }
}
prune("data/avatars", logins);

// ----------------------------------------------------------------- feeds --

const previous = readJson("data/feeds.json", {});
const feeds = {};
const sources = [...new Set(modules("feed").flatMap((m) => splitList(m.opt.sources)))];
for (const source of sources) {
  try {
    let { url, handle, error } = feedUrl(source);
    if (error) throw new Error(error);
    if (handle) { // youtube:@handle -> channel id from the channel page
      const page = await fetch(`https://www.youtube.com/${handle}`, { headers: UA }).then((r) => r.text());
      const id = youtubeChannelId(page);
      if (!id) throw new Error(`no channel id found for ${handle}, use youtube:<channel id>`);
      url = `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
    }
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`${res.status}`);
    feeds[source] = parseFeed(await res.text(), feedLabel(url)).slice(0, 15);
  } catch (err) {
    console.warn(`feed ${source}: ${err.message}`);
    if (previous[source]) feeds[source] = previous[source];
  }
}

// Thumbnails: data/thumbs/<hash of the image URL>, downloaded once.
const thumbs = modules("feed").some((m) => m.opt.thumbs === "on");
mkdirSync(path("data/thumbs"), { recursive: true });
for (const item of Object.values(feeds).flat()) {
  const remote = item.remote || item.thumb; // remote = the original image URL
  item.thumb = "";
  if (!thumbs || !/^https:\/\//i.test(remote || "")) continue;
  item.remote = remote;
  const file = `data/thumbs/${createHash("sha1").update(remote).digest("hex").slice(0, 12)}`;
  try {
    if (!existsSync(path(file))) writeFileSync(path(file), await download(remote));
    item.thumb = file;
  } catch (err) { console.warn(`thumbnail ${remote}: ${err.message}`); }
}
prune("data/thumbs", Object.values(feeds).flat().map((i) => i.thumb.split("/")[2]).filter(Boolean));
writeFileSync(path("data/feeds.json"), JSON.stringify(feeds, null, 1) + "\n");

console.log(`fetched ${data.repos.length} repos, ${data.contributed.length} contributed, ${data.calendar.total} contributions, ` +
  `${data.gists.recent.length} gists, ${logins.length} avatars, ${sources.length} feeds${issue ? `, ${data.guestbook?.entries?.length ?? 0} guestbook entries` : ""}`);
