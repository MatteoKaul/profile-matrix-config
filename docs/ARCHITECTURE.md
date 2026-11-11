# How profile-matrix works

Three repositories:

| Repository | Role |
| --- | --- |
| `MatteoKaul/profile-matrix-config` (this one) | Source of everything: renderer, scripts, fonts, icons, web editor, template files. Releases from here. |
| `MatteoKaul/profile-matrix` | The template users copy. Written only by the release workflow (`tools/export.mjs template`): generator, workflows, `default.settings.txt`, no editor. |
| `<user>/<user>` | A user's profile, created from the template. Holds that user's `settings.txt`, `assets/src/`, and the generated `README.md`, `assets/gen/`, `data/`. |

The editor is published to GitHub Pages from this repository
(`tools/export.mjs site`): <https://matteokaul.github.io/profile-matrix-config/>.
It runs entirely in the visitor's browser and downloads a `settings.txt`.

In a profile repository, `README.md` is the GitHub profile page. It is
**generated**: never edit it by hand, edit `settings.txt` instead.

```
settings.txt ─┐
fonts/*.json ─┤
icons.json ───┼─► scripts/build.mjs ──► README.md
assets/src/ ──┤       │                  assets/gen/**.svg
data/ ───────┘       └─ scripts/render.mjs ─ lib/settings.mjs, lib/draw.mjs
     ▲
scripts/fetch.mjs ◄── GitHub GraphQL API (stats, repos, releases, gists, guestbook),
     │                 RSS/Atom feeds, avatars, thumbnails
scripts/live.mjs ◄─── Twitch API (live status, optional)

editor/ ── loads the same files + render.mjs in the browser, live preview,
           exports a new settings.txt
```

## Files

| Path | What it is |
| --- | --- |
| `settings.txt` | (profile repos only) Everything a user can change: layout, theme, module options. Commented. |
| `default.settings.txt` | Neutral fallback settings, used until a `settings.txt` exists (fresh template copy, hosted editor). |
| `scripts/lib/config.mjs` | Picks the settings file for all scripts: `settings.txt`, else `default.settings.txt`. |
| `README.md` | Generated profile page. |
| `scripts/render.mjs` | Renderer entry: picks the data for each module and assembles README.md. Pure functions, runs in Node and the browser. |
| `scripts/lib/settings.mjs` | Option schema (`THEME_FIELDS`, `TYPES`), settings.txt parser/writer, validation. |
| `scripts/lib/draw.mjs` | Dot-matrix text and every SVG piece (banner, tiles, cards, stats, portfolio, steam, ...). |
| `scripts/build.mjs` | Node entry: reads the files, calls `render`, writes `README.md` and `assets/gen/`. |
| `scripts/fetch.mjs` | Node entry: public GitHub data → `data/github.json`, avatars → `data/avatars/`, feeds → `data/feeds.json` + `data/thumbs/`. |
| `scripts/live.mjs` | Node entry: Twitch live status → `data/live.json` (only with Twitch secrets). |
| `scripts/market.mjs` | Node entry: EOD market prices → chain-linked index in `data/portfolio.json`. |
| `scripts/steam.mjs` | Node entry: Steam playtime + daily snapshots → `data/steam.json` (with `STEAM_API_KEY`). |
| `scripts/lib/sources.mjs` | Parsers and pure state engines (RSS/Atom, gists, guestbook, Twitch, Portfolio TWR chain-linking, Steam snapshot deltas). |
| `scripts/icons.json` | Icon catalog: `categories` (key → heading) and `icons` (key → label, category, SVG markup of the logo in a 24×24 box, optional `scale`). |
| `fonts/*.json` | Font families (`led`, `micro`, `inter`, `roboto`, `jetbrains`, `sans`): each contains `small` and `large` LED dot-matrix glyph grids (`"1"` = dot) plus `vector` contour paths for solid `standard` style rendering. |
| `assets/src/` | Your source files: banner backgrounds (images, GIFs, videos), logos for people cards. |
| `assets/gen/` | Generated SVGs. Deleted and rebuilt on every build. |
| `data/` | Fetched data (created by the workflow): `github.json`, `feeds.json`, `live.json`, `portfolio.json`, `steam.json`, `avatars/`, `thumbs/`, `media/`. |
| `editor/` | Web editor (static HTML/CSS/JS, no build step). Published to Pages only. |
| `template/` | Files only the template gets: `README.md` (usage), `.gitignore`, `.github/workflows/profile.yml` (daily / on-change: fetch, market, steam, build, commit) and `live.yml` (optional 10-minute Twitch check). |
| `tools/export.mjs` | Builds the template (`template <dir>`) or the Pages site (`site <dir>`) into an empty folder. |
| `tools/check.mjs` | Release checks: syntax, template build from defaults, all modules with sample data, site contents. |
| `.github/workflows/release.yml` | On push to `main` (this repo only): version from Conventional Commits, Pages deploy, push to `profile-matrix`, tag and release. |
| `tools/counter/server.mjs` | Self-hosted visitor counter (see below). |
| `HANDOFF.md` | Current status and open points. |

## Running it locally

Needs Node 18 or newer, nothing to install.

```sh
node scripts/build.mjs                    # README + images from data/github.json
node scripts/build.mjs --sample           # same with fake data (try layouts)
node scripts/build.mjs --write-settings   # also rewrite settings.txt with every
                                          # option and its explanation
GITHUB_TOKEN=<token> GH_USER=<login> node scripts/fetch.mjs        # real data
TWITCH_CLIENT_ID=<id> TWITCH_CLIENT_SECRET=<secret> node scripts/live.mjs
```

Video banners (mp4, webm, mov) additionally need `ffmpeg` (with libwebp) for
the one-time conversion; the workflow installs it when needed.

`--sample` overwrites README.md and assets/gen with fake numbers; run a plain
build (or `git checkout README.md assets/gen`) before committing.

## The editor

Hosted: <https://matteokaul.github.io/profile-matrix-config/> (built by
`release.yml`). Locally, from this repository: `python3 -m http.server 8000`
and open <http://localhost:8000/editor/> (it reads `../scripts`, `../fonts`,
`../settings.txt` or `../default.settings.txt`, and `../data/` if present;
without data it uses sample data).

Left: modules (drag to reorder, checkbox to show/hide, "+ Add" for a new one)
and the theme. Middle: options of the selected item. Right: live preview,
rendered with the same code as the real build.

The editor never writes anywhere. "Download settings.txt" saves the file;
"Upload to my repo" opens the upload page of the repository typed next to it
(remembered in this browser only). Dropping a `settings.txt`
anywhere on the page imports it. The workflow in the profile repository
rebuilds the profile after the upload.

"Page" sets the background of the preview: GitHub (dark or light), GitHub
dimmed, high contrast, the card colour or any custom colour (remembered in the
browser only). On github.com the page always has GitHub's own colour; for a
seamless look there, set `theme.card_fill = none` (transparent cards, best
with `theme.mode = auto`), or `outline` (transparent cards with an outline in
`theme.outline_color` = auto: the font colour slightly dimmed (60 %
opacity), following it until you pick a colour; `theme.outline_width`
0.5-3 px, default 0.75) so modules stay
separated on any page colour.

"Data: Sample data" previews modules that need fetched data (projects,
releases, activity, gists, feed, Twitch, guestbook) before you have any.
"Preview: GitHub light" shows the light variant when `theme.mode` is `light`
or `auto`. The theme panel has colour presets (Mono, Amber, Phosphor, Ice,
Red, Grey). A background you try with "Try another background" only lives in
the preview; GIFs play, videos show their first frame.

## settings.txt

Flat `key = value` lines. Lines starting with `#` are comments (only whole
lines, so values like `#ffffff` work), `\n` is a line break inside a text
value. Lists are comma separated, pairs are `key=value` items in a list.
Line lists (now, timeline) have one entry per line (`\n`) with `|` between
the columns.

```
# modules from top to bottom
layout = banner, about, icons, tools, stats
# theme.<option>
theme.shape = circle
# <module id>.<option>
banner.title = LOREM IPSUM
# a second icons module named "tools"
tools.type = icons
```

A module id that equals a type name (`banner`, `icons`, ...) or `about`
(a text module) needs no `.type` line. Removing an id from `layout` hides the
module but keeps its options.

All options with explanations are written into `settings.txt` itself; the
source of truth is `THEME_FIELDS` and `TYPES` in `scripts/lib/settings.mjs`.

## Modules

| Type | Shows | Data |
| --- | --- | --- |
| `banner` | Title in the large dot font on a greyscale photo, animation, video or a colour; optional title animation, cursor and ticker | – |
| `text` | Heading + Markdown text | – |
| `icons` | Logo tiles, grouped by category; only categories with an enabled icon appear | – |
| `projects` | Cards for pinned / recently pushed / listed repos | GitHub |
| `releases` | Cards linking to the latest release(s) | GitHub |
| `stats` | Repos, stars, commits (last year), followers, top languages | GitHub |
| `activity` | Contribution calendar as a dot grid | GitHub |
| `socials` | Link tiles (any icon + URL, optional own label) | – |
| `people` | Cards for people, companies, an employer or your own business: image, name, role, link | GitHub avatars |
| `now` | "What I'm doing now" lines: LABEL \| text, with a blinking cursor | – |
| `timeline` | Education / jobs / milestones on a dotted line | – |
| `feed` | Latest videos or posts from RSS/Atom feeds (YouTube, blogs), with greyscale thumbnails | feeds |
| `twitch` | LIVE card while you stream (pulsing dot, title, game), optional OFFLINE card | Twitch |
| `gists` | Cards for pinned or latest public gists | GitHub |
| `code` | A code snippet in a terminal-style card | – |
| `guestbook` | Latest comments of a guestbook issue + "sign" button | GitHub |
| `counter` | Image from your own counter server | your server |
| `divider` | Dotted line | – |

Prepared but hidden (switch them on in `layout` or the editor): `activity`,
`socials` (contact), `links` (websites, channels, music, games), `support`
(Patreon, Ko-fi, ...), `people` (working with), `companies`, `employer`,
`business` (your own company), `now`, `timeline`, `feed`, `twitch`, `gists`,
`code`, `guestbook`, `counter`, `divider`.

### Links (`socials` type)

`items = icon=url|LABEL, ...`. The label is optional and replaces the icon
name on the tile, so the same platform can appear several times:

```
links.items = website=https://example.com|PORTFOLIO, youtube=https://www.youtube.com/@a|MAIN, youtube=https://www.youtube.com/@b|CLIPS, spotify=https://open.spotify.com/artist/...
```

Links must start with `https://`, `http://` or `mailto:`. All platform icons
are in the `social` category of `scripts/icons.json` (YouTube, YouTube Music,
Spotify, Apple Music, Bandcamp, SoundCloud, Twitch, Kick, Steam, itch.io,
Epic, GOG, PlayStation, blogs, Linktree, website, email, ...). Support /
funding: `patreon`, `kofi`, `buymeacoffee`, `githubsponsors`, `paypal`,
`liberapay`, `opencollective`. Business: `company`, `shop`, `imprint`
(Impressum), `gumroad`, `shopify`, `etsy`.

### People (`people` type)

`items = Name | Role | URL | Image, ...` (no commas inside an entry). Image is
`gh:<login>` for a GitHub avatar (downloaded by `fetch.mjs` on the next
workflow run, shown greyscale), `file:<name>` for your own logo in
`assets/src/` (png/jpg/webp/gif, shown greyscale in a rounded square), an
icon key (e.g. `company`, `shop`, `github`), or empty for the initials. The
same type is used for the `people`, `companies`, `employer` and `business`
modules; add more with `<id>.type = people`. Your own business, e.g.:

```
business.items = Lorem Studio | Web design & development | https://example.com | file:logo.png
```

and an imprint link via a links module: `imprint=https://example.com/impressum|IMPRINT`.

### Banner

- `banner.image`: a file in `assets/src/` or `none` (then `banner.color`).
  Images (png, jpg, webp) are shown still; **GIFs and animated WebPs play**
  inside the banner (greyscale and brightness are applied live). **Videos**
  (mp4, webm, mov) are converted by `build.mjs` with ffmpeg into a greyscale
  animated WebP in `data/media/` (`banner.fps`, `banner.duration`; redone only
  when the file or these options change). Keep animations short: the whole
  banner is one SVG, a warning is printed above 5 MB.
- `banner.contrast`, `banner.brightness`, `banner.position`, `banner.tint`
  (colour of the highlights, `#ffffff` = black and white).
- `banner.effect`: `type` (letters appear one by one), `flicker` (some
  letters flicker like an old LED sign), `pulse` (slow breathing);
  `banner.cursor = on` adds a blinking dot cursor; `banner.ticker` scrolls a
  text along the bottom (`banner.ticker_speed`). All animations are CSS
  inside the SVG; viewers with "reduce motion" see a still banner.
- `banner.font`: `theme` or another font for the banner only (`micro` has
  digits).
- `banner.light`: in light mode `keep` the dark banner or `adapt` it
  (inverted photo, dark letters).

### Feed, Twitch, gists, guestbook

- `feed.sources`: feed URLs or `youtube:<channel id>` / `youtube:@handle`.
  Several feeds are merged by date. Thumbnails (`feed.thumbs`) are downloaded
  once into `data/thumbs/`.
- `twitch`: needs a Twitch application (dev.twitch.tv/console → Register Your
  Application, category "Website Integration", redirect `http://localhost`)
  and its id and secret as repository secrets `TWITCH_CLIENT_ID` and
  `TWITCH_CLIENT_SECRET`. The daily run updates the status; for a current
  LIVE card enable the schedule in `.github/workflows/live.yml` (checks every
  10 minutes, commits only on a change). `twitch.offline = hide` shows the
  card only while you are live.
- `gists`: pinned gists (pin them on your profile like repos) or the latest
  public ones.
- `guestbook`: open an issue in this repo (e.g. "Guestbook – leave a
  comment"), set `guestbook.issue` to its number. With `approval = owner`
  (default) only comments you reacted to with 👍 appear, so spam never shows
  up on the profile. Updated with the daily run.

### Visitor counter

GitHub only shows static files, so counting views needs a small server.
`tools/counter/server.mjs` (Node, no dependencies) answers
`/counter.svg` with the count in the profile style and counts every request.
Run it from a clone of this repo on a machine reachable over https (e.g. your
server behind Caddy / nginx / a Cloudflare Tunnel):

```sh
PORT=8080 COUNT_FILE=/data/count.json node tools/counter/server.mjs
# or with Docker:
docker run -d --restart unless-stopped -p 8080:8080 -v "$PWD":/app -w /app node:22-alpine node tools/counter/server.mjs
```

Then set `counter.url = https://<your host>/counter.svg` and add `counter` to
the layout. (`/counter.svg?light` gives the light colours.)

`projects` and `releases` disappear while they have nothing to show
(`empty = hide`) and appear on their own with the next daily run once you have
a public repo / release.

### Icons and categories

`icons.items` lists the shown icons. Each icon belongs to the category set in
`icons.json`; `icons.move` overrides that per icon (`wireguard=services`),
`icons.order` puts categories first, `icons.titles` renames headings. The
order of icons inside a category follows `icons.items`. In the editor all of
this is drag and drop. Only categories with at least one icon are shown.

Layout options:

- `icons.columns = 1` one category per row with large headings and tiles;
  `2`-`4` puts that many categories side by side with small headings and
  tiles (`icons.grid_size`). Each row of categories is drawn as one image, so
  tiles always stay under their own heading.
- `icons.min_toggle = on` hides categories with fewer than `icons.min_icons` icons.
- `icons.wide_toggle = on` (with columns > 1) gives categories with more than
  `icons.wide_above` icons a full row of their own.
- `icons.style = compact` adds one heading (`icons.title`) above all categories.
- `icons.tile` (also `socials.tile`): `below` = logo with the name underneath
  (default), `none` = logo only, `badge` = logo left, name right (like
  shields.io badges).

To add an icon: add an entry to `scripts/icons.json` with a 24×24 SVG
(`<path d="..."/>`, filled with the current colour). Logos from
[Simple Icons](https://simpleicons.org) (CC0) fit directly.

## Theme and fonts

`theme.*` sets colours, dot shape (`circle`, `square`, `rounded`), dot size,
slant, corner radius and the font. Everything is drawn from these values, so a
new look is a few settings, not code.

- `theme.mode`: `dark` (the colours `fg`, `bg`, ...), `light` (the `light_*`
  colours) or `auto`: every image exists twice (light ones in
  `assets/gen/light/`) and the README uses `<picture>` so GitHub shows the
  one matching the viewer's theme.
- `theme.palette = auto` uses only `fg` / `bg` (and `light_fg` / `light_bg`)
  and mixes the other colours from them; `theme.contrast` sets how far they
  stand out. With `manual` every colour is used as set.
- Fonts: `led` (5×7 text, 7×9 banner) and `micro` (3×5 text, 5×7 banner with
  digits). Small text is scaled to the same height whatever the font, so
  layouts fit with every font.

A font is a JSON file in `fonts/` with a `small` (used for all text) and an
optional `large` grid set (banner). Copy `led.json`, change the grids and set
`theme.font = <file name without .json>`.

## Workflows

**Profile repositories** (`template/.github/workflows/`): `profile.yml` runs
daily at 03:17 UTC, on manual start and when settings, scripts, fonts or
source images change on `main`. It fetches data (Twitch, market and Steam
steps only do something with their secrets), installs ffmpeg only if
`assets/src` has videos, builds, and commits `README.md`, `assets/gen/` and
`data/` if they changed. `live.yml` is the optional frequent Twitch check.
Both share one concurrency group and never push at once. Both skip
themselves in `MatteoKaul/profile-matrix`, so the template keeps its README.

**This repository** (`release.yml`): on every push to `main`, and only in
`MatteoKaul/profile-matrix-config`:

1. `node tools/check.mjs`
2. next version from the commits since the last `vX.Y.Z` tag: `feat!:` or
   `BREAKING CHANGE` = major, `feat:` = minor, `fix:`/`perf:`/`refactor:` =
   patch; only `docs:`/`chore:`/`ci:`/`style:`/`test:` = no release
3. site export -> GitHub Pages
4. template export -> commit "Release vX.Y.Z" + tag in `profile-matrix`
   (pushed with a deploy key that can write to that one repository)
5. tag + GitHub release here

One-time setup: Settings -> Pages -> Source **GitHub Actions**; a deploy key
(`ssh-keygen -t ed25519 -N "" -f pm_key`): `pm_key.pub` under
profile-matrix -> Settings -> Deploy keys with *Allow write access*, `pm_key`
as secret `PROFILE_MATRIX_DEPLOY_KEY` here. In profile-matrix tick
Settings -> General -> **Template repository**.

## Security notes

- In a profile repository the workflow token only has `contents: write` on
  that repository and only reads public data. The optional secrets (Twitch,
  `MARKET_API_KEY`, `STEAM_API_KEY`) are each passed to the one script that
  needs them; request URLs that contain a key are never logged.
- The release workflow pushes to `profile-matrix` with a deploy key, which
  can write to that single repository and nothing else.
- All option values are validated in `resolve()` (lib/settings.mjs): colours must be
  hex, numbers are clamped, select options are checked, image names cannot
  contain paths, module ids are plain names. This keeps settings from
  injecting markup into SVGs or writing/reading files outside the repo folders.
- Text from GitHub (repo descriptions, gist names, guestbook comments), from
  feeds and from Twitch is reduced to plain text and XML-escaped before it
  goes into SVG or HTML. Links from outside must be http(s). Downloaded images
  (avatars, thumbnails) must be png/jpg/gif/webp and under 2 MB; they are
  stored under a hash or login, never under a name from outside.
- Guestbook comments only appear after your 👍 (default), and comments do not
  trigger the workflow.
- The counter server reads nothing from the request except the path and a
  `light` flag, and only serves `/counter.svg` and `/health`.
- The editor has a Content-Security-Policy (only its own files, plus local
  blob: videos for the first-frame preview) and shows the
  preview in a sandboxed iframe without script permission, so an imported
  settings file cannot run code. It stores nothing and sends nothing anywhere.
- Actions are pinned to commit SHAs (checkout v7.0.1, setup-node v7.1.0,
  upload-pages-artifact v5.0.0, deploy-pages v5.0.1; all Node 24), so a moved
  tag cannot run other code. checkout keeps no token (`persist-credentials:
  false`); only the step that pushes gets it. `${{ }}` values reach scripts
  only through `env:`, never pasted into a `run:` block. release.yml grants
  no permissions at workflow level; each job asks for its own.
- settings.txt is parsed into objects without a prototype, and module names
  that are built-in object members (`constructor`, `__proto__`, ...) are refused.
- Steam, market and Twitch steps never fail the build: on an error they log a
  warning, keep the last good data and exit 0 (`scripts/lib/optional.mjs`).
- Portfolio weights are rounded (`portfolio.precision`, default 1 %) before
  they are saved; the editor warns below 1 % and with two positions.
