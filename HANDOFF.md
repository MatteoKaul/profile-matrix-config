# Handoff

Working notes for whoever continues this repo (human or AI). Keep this file
current: update "Status" and "Open" with every meaningful commit.

## Goal

**profile-matrix**: GitHub profile READMEs in a minimal black-and-white,
dot-matrix (LED) style, generated from one settings file. Anyone designs
theirs in the hosted web editor, copies the `profile-matrix` template and
uploads the file. Started as the owner's own profile (MatteoKaul/MatteoKaul,
display name *Matrexx*), which is now a normal user of the template.

Conversation language with the owner is German; everything in the repo is English.

## How it works (short)

```
profile-matrix-config (this repo, source)
  scripts/ fonts/ editor/ template/ default.settings.txt
  release.yml on push to main:
     tools/check.mjs -> version from Conventional Commits
     tools/export.mjs site     -> GitHub Pages (web editor)
     tools/export.mjs template -> MatteoKaul/profile-matrix (commit + tag)

profile-matrix (template)          <user>/<user> (profile, copy of the template)
  generator + workflows,            settings.txt (uploaded) + assets/src/
  no editor, no personal data       profile.yml daily: fetch -> build -> commit
```

Details for each file: see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

Done (moved here from MatteoKaul/MatteoKaul, branch `feat/dashboard-extensions`):

- Dot-matrix banner: configurable title, font, image, brightness, contrast,
  tint, letter shadow; animated backgrounds (GIF / animated WebP play,
  mp4/webm/mov are converted with ffmpeg to `data/media/`); title effects
  type / flicker / pulse, blinking cursor, LED ticker (CSS, reduced-motion aware)
- Icon catalog: 288 logos in 24 categories (`scripts/icons.json`) incl.
  support/funding (Patreon, Ko-fi, Sponsors, PayPal, ...) and business
  (company, shop, imprint, Gumroad, Shopify, Etsy)
- Modules: banner, text, icons, projects, contributed, releases, stats, followers,
  spoken, portfolio, steam, activity, socials, people, now, timeline, feed,
  twitch, gists, code, guestbook, counter, divider
- Module 1 (UI/UX, Typography & Editor):
  - Strict separation of **Font Family** (`theme.font`: `led`, `micro`, `inter`, `roboto`, `jetbrains`, `sans`) and **Renderer Style** (`theme.style` / `banner.style`: `led` dot-matrix vs. `standard` solid vector contours), enabling LED dot-matrix rendering on any font family
  - Diagonal LED gap & slant bugfix (`glyphPoints` in `scripts/lib/draw.mjs`): Euclidean bridge interpolation eliminates pixel-shifting and gaps on diagonal strokes (`A`, `M`, `V`, `W`, `N`, `K`, `X`, `Z`) across all fonts and italic slant angles
  - Colour presets extended with **Purple** (`#b877ff`) plus a dedicated free Font Colour Picker (supporting both `#rrggbb` Hex and `rgb(r, g, b)` input)
  - Prominent Repository Secrets warning boxes + step-by-step guide modal (`Settings -> Secrets and variables -> Actions -> New repository secret`) and validation against accidental plaintext secrets in `settings.txt`
  - Global (`theme.animation_speed`) and per-component (`banner.animation_speed`, `twitch.animation_speed`, `now.animation_speed`) animation speed sliders and presets
  - Dynamic Icon Grid: 2-mode single-icon group handling (`icons.dissolve_single = keep | more | hide` — *Dissolve into "More"* or *Hide*), automatic & manual 2x double-width tiles (`icons.double_mode`, `icons.double_items`), and Layout Continuity switch (`icons.continuity = unified | granular` with `icons.col_spans`)
- Module 2 (Privacy-First Portfolio & Asset Tracker):
  - Zero-Knowledge client-side conversion of absolute €/$ inputs into percentage weights (`portfolio.allocations`), rejecting currency values in `settings.txt`
  - Chain-linked Time-Weighted Return (TWR) index (`Start = 100.00`) in `scripts/market.mjs` & `scripts/lib/sources.mjs`, preserving history across rebalancings
  - 7-day threshold lock, Donut/Stacked Bar/Treemap allocation charts, YTD/1w/1m/1y/Custom timeframes, Linear (%)/Log Y-axis scaling, and mandatory disclaimer (`Keine Anlageberatung. Alle Angaben ohne Gewähr.`)
- Module 3 (Steam Profile Integration):
  - `scripts/steam.mjs` (`IPlayerService/GetOwnedGames` via `STEAM_API_KEY`) with daily `playtime_forever` snapshots (`data/steam.json`) for exact 7-day and 30-day deltas
  - Flexible presets (`top5`, `top10`, `custom5`, `custom10`), metric selector (`total`, `period`, `both`), and exclusion filter (`steam.exclude`) with automatic rank promotion
- Module 4 (Extended GitHub & Profile Metrics):
  - Profile Views (`counter` with fallback/static badge support), Spoken Languages (`spoken`), GitHub Followers (`followers`), and Projects I Participate In (`contributed` via GraphQL `repositoriesContributedTo`)
- Module 5 (CI/CD, Auto-Release & Fork/Template Hygiene):
  - Repo split: this repo is the source; `profile-matrix` is the template (written by `release.yml` only); the editor is hosted on Pages. Desktop binaries dropped (owner's decision).
  - `release.yml`: repo guard, version from Conventional Commits, Pages deploy, push to `profile-matrix` with a deploy key, tag + release. `tools/check.mjs` runs first.
  - Neutral fallback `default.settings.txt` (read via `scripts/lib/config.mjs` until a `settings.txt` exists); personal defaults removed (banner title, background image, Twitch channel)
  - Editor: "Upload to my repo" (opens the upload page of the visitor's repo), drag & drop import, version shown in the top bar, secrets guide built from `SECRETS` in settings.mjs
  - Market providers: yahoo (no key), tiingo (US only, refuses suffixed tickers), eodhd (Xetra/Europe), alphavantage, stooq (key since 2026); key never logged
- Projects / releases / feed / gists hide themselves until there is data
- Theme: dark / light / auto (`<picture>`), palette auto from fg/bg +
  contrast, colour presets in the editor, dot shape/size, slant, radius,
  fonts `led` and `micro`
- One workflow (`Update profile`) for fetch + Twitch + build + commit;
  actions pinned to commit SHAs
- Graphical editor (`editor/`) with drag & drop layout, icon picker, row
  editors, presets, light/dark preview, background upload (GIF plays, video
  first frame)
- Prepared but hidden: `links`, `support`, `socials`, `people`, `companies`,
  `employer`, `business`, `activity`, `divider`, `now`, `timeline`, `feed`,
  `twitch`, `gists`, `code`, `guestbook`, `counter`
- Tested offline: all modules with sample data in Chromium (dark, light,
  auto, micro font, amber tint), video conversion, animations over time,
  fetch.mjs / live.mjs against mocked GitHub, YouTube, RSS and Twitch
  responses, counter server, editor (presets, rows, video upload)
- Docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (files, settings, modules, editor, security)

## Open

- [ ] Owner, once: Pages source "GitHub Actions" here; deploy key
      (`PROFILE_MATRIX_DEPLOY_KEY` here, public half with write access in
      profile-matrix); tick "Template repository" in profile-matrix. Steps in
      docs/ARCHITECTURE.md -> Workflows.
- [ ] First real runs: `release.yml` here, `profile.yml` in a fresh copy of
      the template. `fetch.mjs`, `live.mjs`, `market.mjs`, `steam.mjs` are only
      tested against mocked responses (APIs blocked in the dev container).
- [ ] Portfolio: when one ticker fails on the first day the index starts
      from the others only; decide whether to wait until all have a price.
- [ ] Template copies do not get updates by themselves. Options: a
      "sync generator" workflow in the template that pulls the latest
      `profile-matrix` release, or the engine as a versioned action.
- [ ] Editor: ZIP download with settings.txt + the images used from
      `assets/src/` (today they must be uploaded separately).
- [ ] Owner, when wanted: Twitch secrets + live.yml schedule; guestbook
      issue; counter server; real GIFs/videos in `assets/src`.

## Ideas (not built)

- Spotify "now playing" / recently played (needs a Spotify refresh token secret)
- WakaTime coding time per language (needs a WakaTime API key)
- Steam: recently played games (public Steam Web API key)
- Contribution "snake" in dots (SVG animation of the activity grid)
- Per-module light/dark override, more fonts (e.g. a 7x9 bold heading font)

## Decisions

- **One renderer in JS** so the editor preview is exactly the real output.
  The banner is an SVG with the photo embedded (base64) and SVG filters for
  greyscale/brightness/shadow; no image libraries needed.
- **Generated files only in `assets/gen/`**; it is wiped on every build.
- **Releases/projects auto-hide** while empty (owner's request); the same for feed and gists.
- **Animated banners stay one SVG**: GIF / animated WebP are embedded as is
  (browsers animate them inside SVG images, filters included); videos are
  converted once to animated WebP because GitHub cannot embed repo videos.
- **Light mode via `<picture>`**, the official GitHub way; images identical
  in both modes (e.g. a kept banner) are not duplicated.
- **Twitch every 10 min is opt-in** (commented schedule), so the Actions tab
  stays quiet until the module is used.
- **Guestbook moderation by 👍** of the owner, default on.
- Settings stay a flat `key = value` text file so they can be edited on
  github.com directly; `node scripts/build.mjs --write-settings` rewrites it
  with all options and comments.
- Icon logos come from the Simple Icons npm package (CC0); Windows, C#, SQL,
  LinkedIn, email, website, company, shop and imprint are hand-drawn because
  Simple Icons lacks them.

## Owner preferences (from the conversation)

- Minimal, black/white, clean; dot font like the "CHAT" lettering of the owner's stream overlay
- Banner title switchable: MATREXX, MATTEO, MATTEO KAUL, LUMI, LUMIEREZ, LUMI CODE
- Shadow: subtle, following the letter shape (60 is good, 40 too weak)
- Wants to understand and check everything personally: comment the code, keep it small
- Studies Applied Computer Science; languages C, JavaScript, TypeScript, Java, Python
- Uses macOS, CachyOS, Windows, Ubuntu, Raspberry Pi OS, TrueNAS, Docker,
  WireGuard, Ghostty, Claude, Godot (Git and CMake known but hidden for now)
