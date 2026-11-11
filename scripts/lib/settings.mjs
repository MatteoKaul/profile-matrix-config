// Settings: the option schema, settings.txt parsing/writing and validation.
//
//   THEME_FIELDS / TYPES   every option with label, type, default and help text;
//                          the editor builds its forms from these, writeSettings
//                          its comments, resolve() its validation
//   parseSettings          settings.txt text -> flat {key: value}
//   writeSettings          flat settings -> settings.txt text with comments
//   resolve                flat settings -> {theme, layout, modules}, validated

// ---------------------------------------------------------------- schema --

// Theme options, written as "theme.<key>" in settings.txt.
export const FONTS = ["led", "micro", "inter", "roboto", "jetbrains", "sans"]; // files in fonts/, offered by the editor
export const MATRIX_FONTS = ["led", "micro"]; // pure dot-matrix fonts that automatically enforce style = "led"

export const THEME_FIELDS = [
  { key: "mode", label: "Mode", type: "select", options: ["dark", "light", "auto"], default: "dark",
    help: "dark = dark colours below | light = the light colours | auto = both; GitHub shows the one matching the viewer's theme" },
  { key: "font", label: "Font family", type: "name", suggest: FONTS, default: "led",
    help: "Font family in fonts/ (fonts/<name>.json): led, micro, inter, roboto, jetbrains (JetBrains Mono), sans (System Sans-Serif)" },
  { key: "style", label: "Renderer style", type: "select", options: ["led", "standard"], default: "led",
    help: "led = dot-matrix LED points for any chosen font family | standard = solid vector letterforms" },
  { key: "shape", label: "Dot shape (LED style)", type: "select", options: ["circle", "square", "rounded"], default: "circle",
    help: "circle = LED look, square = pixel look, rounded = in between (used when style = led)" },
  { key: "dot", label: "Dot size", type: "number", min: 0.2, max: 0.5, step: 0.01, default: 0.39,
    help: "Dot radius relative to the dot spacing (0.5 = dots touch)" },
  { key: "slant", label: "Slant", type: "number", min: 0, max: 0.4, step: 0.01, default: 0.22,
    help: "Italic slant, 0 = upright" },
  { key: "animation_speed", label: "Animation speed", type: "number", min: 0.2, max: 4.0, step: 0.1, default: 1.0,
    help: "Global animation speed multiplier (1.0 = normal, 0.5 = half speed, 2.0 = double speed)" },
  { key: "fg", label: "Foreground", type: "color", default: "#ffffff", help: "Main text and logos" },
  { key: "muted", label: "Muted", type: "color", default: "#cfcfcf", help: "Labels and secondary text" },
  { key: "faint", label: "Faint", type: "color", default: "#7a7a7a", help: "Placeholders and hints" },
  { key: "dim", label: "Dim", type: "color", default: "#2c2c2c", help: "Inactive dots (bars, activity grid)" },
  { key: "bg", label: "Card background", type: "color", default: "#000000", help: "Background of all cards and bars" },
  { key: "card_fill", label: "Card fill", type: "select", options: ["solid", "none", "outline"], default: "solid",
    help: "solid = cards filled with the card background | none = transparent cards on GitHub's own page background\n" +
      "outline = transparent cards with a visible outline (colour below), so modules stay apart on any page colour.\n" +
      "With none and outline a banner without image is transparent, too" },
  { key: "outline_color", label: "Outline colour", type: "color", auto: true, default: "auto",
    help: "Only with card fill = outline. auto = the font colour, slightly dimmed (follows it when you change colours);\n" +
      "pick a colour to set it yourself, \"Auto\" switches back" },
  { key: "outline_width", label: "Outline thickness", type: "number", min: 0.5, max: 3, step: 0.25, default: 0.75,
    help: "Line width in px on screen (card fill = outline); the same on every card, heading and the banner" },
  { key: "border", label: "Border", type: "color", default: "#2a2a2a", help: "Card outline" },
  { key: "palette", label: "Palette", type: "select", options: ["manual", "auto"], default: "manual",
    help: "manual = use every colour as set | auto = only fg and bg (and light_fg / light_bg) are used, the others are mixed from them by contrast" },
  { key: "contrast", label: "Contrast", type: "number", min: 0, max: 100, step: 1, default: 70,
    help: "Only with palette = auto: how far labels, hints and borders stand out from the background. Reference: 40 = soft | 70 = default | 100 = hard" },
  { key: "light_fg", label: "Light: foreground", type: "color", default: "#111111", help: "Light mode (mode = light or auto): main text and logos" },
  { key: "light_muted", label: "Light: muted", type: "color", default: "#3d3d3d", help: "Light mode: labels and secondary text" },
  { key: "light_faint", label: "Light: faint", type: "color", default: "#8a8a8a", help: "Light mode: placeholders and hints" },
  { key: "light_dim", label: "Light: dim", type: "color", default: "#dadada", help: "Light mode: inactive dots" },
  { key: "light_bg", label: "Light: background", type: "color", default: "#ffffff", help: "Light mode: background of all cards" },
  { key: "light_border", label: "Light: border", type: "color", default: "#d0d7de", help: "Light mode: card outline" },
  { key: "radius", label: "Corner radius", type: "number", min: 0, max: 24, step: 1, default: 12,
    help: "Rounding of cards and bars in px" },
  { key: "text_font", label: "Text font", type: "text", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    help: "Font for longer text (project descriptions); must be installed on the viewer's system" },
];

const SIZE = { min: 60, max: 140, step: 2 };

// Module types and their options, written as "<module id>.<key>".
// A module id that matches a type name (or "about") needs no ".type" line.
export const TYPES = {
  banner: {
    label: "Banner", help: "Big title on a background image",
    fields: [
      { key: "title", label: "Title", type: "text", default: "HELLO WORLD",
        help: "Letters A-Z and spaces; long titles shrink to fit. E.g. your name or handle" },
      { key: "font", label: "Font family", type: "name", suggest: ["theme", ...FONTS], default: "theme",
        help: "theme = the theme font family, or a font name for the banner only (led, micro, inter, roboto, jetbrains, sans)" },
      { key: "style", label: "Renderer style", type: "select", options: ["theme", "led", "standard"], default: "theme",
        help: "theme = use theme.style | led = dot-matrix LED points | standard = solid vector letters" },
      { key: "image", label: "Background", type: "file", default: "none",
        help: "File in assets/src, or none. Images: png, jpg, webp. Animated: gif, animated webp.\n" +
          "Videos (mp4, webm, mov) are turned into an animated webp by the workflow (needs ffmpeg locally)" },
      { key: "color", label: "Background colour", type: "color", default: "#111111", help: "Used when image = none" },
      { key: "zoom", label: "Image zoom (%)", type: "number", min: 100, max: 400, step: 1, default: 100,
        help: "100 = the photo fills the banner width | more = zoom in. In the editor preview: drag the banner to move, Alt + scroll to zoom" },
      { key: "position_x", label: "Image position horizontal", type: "number", min: 0, max: 100, step: 1, default: 50,
        help: "Which part of a zoomed photo is shown, 0 = left, 100 = right" },
      { key: "position", label: "Image position vertical", type: "number", min: 0, max: 100, step: 1, default: 30,
        help: "Which part of the photo is shown, 0 = top, 100 = bottom" },
      { key: "brightness", label: "Image brightness", type: "number", min: 0, max: 100, step: 1, default: 42,
        help: "Reference: 30 = dark | 42 = default | 70 = bright" },
      { key: "contrast", label: "Image contrast", type: "number", min: 50, max: 200, step: 1, default: 115,
        help: "Reference: 90 = flat | 115 = default | 150 = punchy" },
      { key: "tint", label: "Image tint", type: "color", default: "#ffffff",
        help: "Colour of the photo's highlights; #ffffff = black and white, e.g. #ffb000 = amber" },
      { key: "shadow", label: "Letter shadow", type: "number", min: 0, max: 100, step: 1, default: 60,
        help: "Reference: 40 = barely visible | 60 = subtle (default) | 67 = stronger" },
      { key: "effect", label: "Title animation", type: "select", options: ["none", "type", "flicker", "pulse"], default: "none",
        help: "none | type = letters appear one by one, then clear | flicker = a few letters flicker like an old LED sign | pulse = slow breathing" },
      { key: "animation_speed", label: "Animation speed", type: "number", min: 0.2, max: 4.0, step: 0.1, default: 1.0,
        help: "Component animation speed multiplier (multiplies with theme.animation_speed)" },
      { key: "cursor", label: "Blinking cursor", type: "toggle", default: "off", help: "A blinking dot cursor after the title" },
      { key: "ticker", label: "Ticker text", type: "text", default: "",
        help: "Scrolling LED line at the bottom of the banner, empty = off. E.g. NOW BUILDING: LOREM IPSUM +++ NEW VIDEO OUT" },
      { key: "ticker_speed", label: "Ticker speed", type: "number", min: 20, max: 200, step: 5, default: 60, help: "Pixels per second" },
      { key: "fps", label: "Video frames per second", type: "number", min: 4, max: 24, step: 1, default: 12,
        help: "Only for videos: lower = smaller file" },
      { key: "duration", label: "Video length", type: "number", min: 1, max: 10, step: 0.5, default: 4,
        help: "Only for videos: seconds used from the start of the clip (it loops)" },
      { key: "light", label: "In light mode", type: "select", options: ["keep", "adapt"], default: "keep",
        help: "Only with theme.mode = light or auto. keep = the banner stays dark | adapt = inverted photo, dark letters" },
    ],
  },
  text: {
    label: "Text", help: "Free text (Markdown)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "", help: "Leave empty for no heading" },
      { key: "text", label: "Text", type: "textarea", default: "", help: "Markdown; line breaks are kept" },
    ],
  },
  icons: {
    label: "Icons", help: "Logo tiles, grouped into categories automatically",
    fields: [
      { key: "items", label: "Icons", type: "icons", default: "",
        help: "Shown icons, in this order within each category (see scripts/icons.json)" },
      { key: "style", label: "Layout", type: "select", options: ["sections", "compact"], default: "sections",
        help: "sections = a full heading per category | compact = one heading, small category labels" },
      { key: "title", label: "Heading (compact)", type: "text", default: "SKILLS & TOOLS", help: "Only used with style = compact" },
      { key: "tile", label: "Tile style", type: "select", options: ["below", "none", "badge"], default: "below",
        help: "below = logo with the name underneath | none = logo only | badge = logo left, name right" },
      { key: "size", label: "Tile size", type: "number", ...SIZE, default: 100,
        help: "Display height in px (columns = 1). Reference: 120 = large | 100 = medium (default) | 80 = small" },
      { key: "columns", label: "Categories side by side", type: "number", min: 1, max: 4, step: 1, default: 1,
        help: "1 = one category per row with large headings | 2-4 = small headings and tiles, categories in columns" },
      { key: "grid_size", label: "Tile size (columns > 1)", type: "number", min: 40, max: 100, step: 2, default: 64,
        help: "Tile height in px at full README width. Reference: 80 = large | 64 = default | 48 = small" },
      { key: "continuity", label: "Layout continuity", type: "select", options: ["unified", "granular"], default: "unified",
        help: "unified = Mode A: unifies all columns within a topic automatically | granular = Mode B: allows manual width overrides per category/column or icon" },
      { key: "dissolve_single", label: "Single-icon groups", type: "select", options: ["keep", "more", "hide"], default: "keep",
        help: "keep = keep as own category | more = Dissolve into \"More\" (merge single-icon groups into a combined 'More' group) | hide = Hide categories containing only 1 icon" },
      { key: "double_mode", label: "Double-width (2x) mode", type: "select", options: ["off", "auto", "manual", "both"], default: "off",
        help: "off = normal width | auto = fill odd grid rows with 2x width | manual = only icons in double_items | both = manual + auto row fill" },
      { key: "double_style", label: "2x style", type: "select", options: ["wide", "large"], default: "wide",
        help: "wide = a 2x icon is twice as wide, same height (auto fills rows with it) | large = twice as big in width and height, with a bigger logo and label (auto fill does not apply)" },
      { key: "double_items", label: "Double-width icons", type: "list", default: "",
        help: "Icons rendered at 2x width (in manual/both mode or granular continuity), e.g. docker, linux" },
      { key: "col_spans", label: "Category column spans (granular)", type: "pairs", default: "",
        help: "Only in continuity = granular: category=span pairs (1..columns) to manually set category column widths, e.g. languages=2, os=2" },
      { key: "min_toggle", label: "Hide small categories", type: "toggle", default: "off",
        help: "on = only show categories with at least \"Minimum icons\" icons" },
      { key: "min_icons", label: "Minimum icons", type: "number", min: 1, max: 4, step: 1, default: 2 },
      { key: "wide_toggle", label: "Full row for large categories", type: "toggle", default: "off",
        help: "on = with columns > 1, categories with more than \"Full row above\" icons get a whole row" },
      { key: "wide_above", label: "Full row above", type: "number", min: 1, max: 4, step: 1, default: 4 },
      { key: "move", label: "Category overrides", type: "pairs", default: "",
        help: "icon=category pairs, e.g. wireguard=services" },
      { key: "order", label: "Category order", type: "list", default: "",
        help: "Categories listed first, in this order; the rest follow in catalog order" },
      { key: "links", label: "Icon links", type: "iconlinks", default: "",
        help: "icon=https://... pairs: that icon becomes a link (https, http or mailto). An image can hold only one link, so in a\n" +
          "multi-column layout a category with linked icons is shown as its own full-width block of single tiles" },
      { key: "hidden", label: "Hidden categories", type: "list", default: "",
        help: "Categories that are not shown, whatever number of icons they hold (the icons stay in items; the editor's Hide / Show buttons set this)" },
      { key: "titles", label: "Category headings", type: "pairs", default: "",
        help: "category=HEADING pairs to rename categories, e.g. os=SYSTEMS" },
    ],
  },
  projects: {
    label: "Projects", help: "Cards for your repositories (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "PROJECTS" },
      { key: "mode", label: "Which repos", type: "select", options: ["pinned", "recent", "list"], default: "pinned",
        help: "pinned = repos pinned on your profile | recent = last pushed | list = the repos below" },
      { key: "repos", label: "Repos (list mode)", type: "list", default: "", help: "Repo names, in this order" },
      { key: "limit", label: "Max cards", type: "number", min: 1, max: 12, step: 1, default: 6 },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide",
        help: "hide = section disappears until there is something to show | placeholder = show a NO ... YET card" },
    ],
  },
  contributed: {
    label: "Projects I Participate In", help: "External repositories you contribute to (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "PROJECTS I PARTICIPATE IN" },
      { key: "mode", label: "Selection mode", type: "select", options: ["auto", "list"], default: "auto",
        help: "auto = repositories you contributed to on GitHub | list = specific owner/repo entries below" },
      { key: "repos", label: "Repositories (list or extra)", type: "list", default: "",
        help: "Optional owner/repo names, e.g. example-org/web-framework, octocat/Hello-World" },
      { key: "exclude", label: "Exclude repos", type: "list", default: "",
        help: "Repo names or owner/repo to hide from automatic list" },
      { key: "limit", label: "Max cards", type: "number", min: 1, max: 12, step: 1, default: 6 },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide" },
    ],
  },
  releases: {
    label: "Releases", help: "Cards linking to your latest releases (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "RELEASES" },
      { key: "mode", label: "Which releases", type: "select", options: ["latest", "each", "list"], default: "latest",
        help: "latest = only the newest release across all repos | each = latest release of every repo | list = the repos below" },
      { key: "repos", label: "Repos (list mode)", type: "list", default: "" },
      { key: "limit", label: "Max cards", type: "number", min: 1, max: 12, step: 1, default: 6 },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide",
        help: "hide = section disappears until there is something to show | placeholder = show a NO ... YET card" },
    ],
  },
  stats: {
    label: "Stats", help: "Repos, stars, commits, followers and top languages (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "STATS" },
      { key: "languages", label: "Top languages", type: "number", min: 0, max: 8, step: 1, default: 5,
        help: "How many language bars, 0 = none" },
    ],
  },
  followers: {
    label: "GitHub Followers", help: "Follower counter and recent followers showcase (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "FOLLOWERS" },
      { key: "style", label: "Display style", type: "select", options: ["card", "compact", "badges"], default: "card",
        help: "card = counter + recent follower cards | compact = full-width summary bar | badges = avatar strip" },
      { key: "limit", label: "Recent followers shown", type: "number", min: 0, max: 12, step: 1, default: 6,
        help: "0 = show only the follower count and stats" },
    ],
  },
  spoken: {
    label: "Spoken Languages", help: "Human languages you speak with optional proficiency level",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "SPOKEN LANGUAGES" },
      { key: "items", label: "Languages", type: "rows", columns: ["Language", "Level (e.g. Native, C1)", "Proficiency % (10-100)"],
        default: "GERMAN | NATIVE (C2) | 100\nENGLISH | FLUENT (C1) | 90",
        help: "One language per line (\\n in settings.txt): LANGUAGE | LEVEL | optional percentage (10-100) for the dot bar.\n" +
          "E.g. GERMAN | NATIVE (C2) | 100\\nENGLISH | FLUENT (C1) | 90" },
      { key: "style", label: "Display style", type: "select", options: ["bars", "cards"], default: "bars",
        help: "bars = dot-matrix progress bars in one card | cards = side-by-side cards" },
    ],
  },
  portfolio: {
    label: "Portfolio & Asset Tracker",
    help: "Privacy-first portfolio allocation and chain-linked performance index (never stores absolute currency values; MARKET_API_KEY secret for every provider except yahoo)",
    secretWarning: {
      secrets: ["MARKET_API_KEY"],
      text: "Needed for every provider except yahoo. Never put the key or absolute amounts (EUR/USD) into settings.txt.",
    },
    fields: [
      { key: "title", label: "Heading", type: "text", default: "PORTFOLIO" },
      { key: "allocations", label: "Asset weights (% only, Zero-Knowledge)", type: "portfolio", default: "",
        help: "Ticker=Weight%|Label pairs (sum = 100%). Absolute €/$ values entered in the editor are converted client-side to percentages immediately and are NEVER saved or exported.\n" +
          "E.g. VWCE.DE=60|FTSE ALL-WORLD, AAPL=25|APPLE, BTC-USD=15|BITCOIN" },
      { key: "precision", label: "Weight precision (%)", type: "select", options: ["5", "1", "0.5", "0.1"], default: "1",
        help: "Weights are rounded to this step before they are saved. Finer steps let others estimate how many shares you hold\n" +
          "(weights + public prices on the commit date). 1 = recommended | 0.5 or 0.1 = not recommended" },
      { key: "provider", label: "Market data provider", type: "select", options: ["yahoo", "tiingo", "eodhd", "alphavantage", "stooq"], default: "yahoo",
        help: "yahoo = no key, unofficial (can break) | tiingo = US listings only | eodhd = also Xetra & Europe | alphavantage, stooq = small free quota\nAll except yahoo read the repository secret MARKET_API_KEY" },
      { key: "chart", label: "Allocation chart type", type: "select", options: ["donut", "bar", "treemap"], default: "donut",
        help: "donut = segmented ring chart | bar = stacked allocation bar | treemap = proportional 2D tiles" },
      { key: "show_performance", label: "Show performance graph", type: "toggle", default: "on",
        help: "on = show chain-linked index graph (requires at least 7 days of history; locked before 7 days)" },
      { key: "period", label: "Performance timeframe", type: "select", options: ["ytd", "1w", "1m", "1y", "custom"], default: "ytd",
        help: "ytd = Year-to-Date (default) | 1w = Last Week (7d) | 1m = Last Month (30d) | 1y = Last Year (365d) | custom = Custom days below" },
      { key: "custom_days", label: "Custom timeframe (days)", type: "number", min: 7, max: 3650, step: 1, default: 90,
        help: "Used when period = custom (minimum 7 days)" },
      { key: "scale", label: "Y-axis scaling", type: "select", options: ["linear", "log"], default: "linear",
        help: "linear = relative change in % | log = logarithmic index scale" },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide" },
    ],
  },
  steam: {
    label: "Steam Profile",
    help: "Public Steam profile playtime tracker with daily snapshots for exact 7d/30d deltas (requires STEAM_API_KEY secret)",
    secretWarning: {
      secrets: ["STEAM_API_KEY"],
      text: "Required. Your Steam profile and its \"Game details\" must be set to Public, or Steam returns no games.",
    },
    fields: [
      { key: "title", label: "Heading", type: "text", default: "STEAM PLAYTIME" },
      { key: "steam_id", label: "SteamID64", type: "text", default: "",
        help: "Your 17-digit public SteamID64 (e.g. 76561198000000000), or leave empty and set STEAM_ID64 as a repo secret" },
      { key: "period", label: "Timeframe", type: "select", options: ["all", "1m", "1w"], default: "all",
        help: "all = All-Time | 1m = Last Month (30 days via daily snapshot delta) | 1w = Last Week (7 days via daily snapshot delta)" },
      { key: "metric", label: "Displayed metric", type: "select", options: ["total", "period", "both"], default: "both",
        help: "total = total playtime | period = playtime in selected timeframe | both = total playtime + timeframe delta" },
      { key: "preset", label: "Filter preset", type: "select", options: ["top5", "top10", "custom5", "custom10"], default: "top5",
        help: "top5 / top10 = highest playtime in timeframe | custom5 / custom10 = manually picked games below" },
      { key: "custom", label: "Custom games (AppIDs or names)", type: "list", default: "",
        help: "Only for custom5 / custom10: comma-separated Steam AppIDs or game names in display order" },
      { key: "exclude", label: "Exclude games (AppIDs or names)", type: "list", default: "",
        help: "Games to exclude (by AppID or name); next-ranked games automatically move up (e.g. Top 5 excl. Game X and Y)" },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide" },
    ],
  },
  activity: {
    label: "Activity", help: "Contribution calendar of the last year as a dot grid (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "ACTIVITY" },
      { key: "weeks", label: "Weeks", type: "number", min: 12, max: 53, step: 1, default: 53 },
    ],
  },
  socials: {
    label: "Socials", help: "Link tiles to your profiles",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "CONTACT" },
      { key: "items", label: "Links", type: "links", default: "",
        help: "icon=url pairs, optionally with a label: icon=url|LABEL. The same icon may appear more than once.\n" +
          "E.g. youtube=https://www.youtube.com/@name|MAIN, youtube=https://www.youtube.com/@name2|CLIPS, website=https://example.com|BLOG" },
      { key: "tile", label: "Tile style", type: "select", options: ["below", "none", "badge"], default: "below",
        help: "below = logo with the name underneath | none = logo only | badge = logo left, name right" },
      { key: "size", label: "Tile size", type: "number", ...SIZE, default: 72,
        help: "Display height in px of a below-style tile; the other styles scale with it" },
    ],
  },
  people: {
    label: "People", help: "Cards for people or companies you work with, or your employer",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "WORKING WITH" },
      { key: "items", label: "Entries", type: "people", default: "",
        help: "Entries separated by commas, each: Name | Role | URL | Image.\n" +
          "Image: gh:<github login> (avatar, fetched by the workflow), an icon key from icons.json,\n" +
          "file:<name> (a logo in assets/src, png/jpg/webp), or empty for initials.\n" +
          "E.g. Jane Doe | Co-founder | https://github.com/jane | gh:jane, Acme GmbH | Client | https://acme.example | website" },
    ],
  },
  now: {
    label: "Now", help: "What you are doing right now, one line per topic",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "NOW" },
      { key: "items", label: "Lines", type: "rows", columns: ["Label", "Text"], default: "",
        help: "One line per entry (\\n between them in settings.txt), each: LABEL | text.\n" +
          "E.g. BUILDING | a small dashboard\\nLEARNING | Rust\\nPLAYING | Factorio" },
      { key: "cursor", label: "Blinking cursor", type: "toggle", default: "on", help: "A blinking dot after the last line" },
      { key: "animation_speed", label: "Animation speed", type: "number", min: 0.2, max: 4.0, step: 0.1, default: 1.0,
        help: "Cursor blink speed multiplier" },
    ],
  },
  timeline: {
    label: "Timeline", help: "Education, jobs and milestones on a dotted line",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "TIMELINE" },
      { key: "items", label: "Entries", type: "rows", columns: ["When", "Title", "Detail"], default: "",
        help: "One line per entry, newest first, each: WHEN | TITLE | detail.\n" +
          "E.g. 2024 - NOW | COMPUTER SCIENCE | Bachelor, University of ...\\n2023 | ABITUR | ..." },
    ],
  },
  feed: {
    label: "Feed", help: "Latest videos or posts from RSS / Atom feeds (YouTube, blogs), fetched by the workflow",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "LATEST VIDEOS" },
      { key: "sources", label: "Feeds", type: "list", default: "",
        help: "Feed URLs, or youtube:<channel id> / youtube:@handle. Several feeds are merged by date.\n" +
          "E.g. youtube:@yourchannel, https://blog.example.com/rss.xml" },
      { key: "limit", label: "Max entries", type: "number", min: 1, max: 12, step: 1, default: 4 },
      { key: "thumbs", label: "Thumbnails", type: "toggle", default: "on", help: "Show the video / post image (in greyscale)" },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide" },
    ],
  },
  twitch: {
    label: "Twitch live", help: "Shows when you are live on Twitch (needs TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET secrets)",
    secretWarning: {
      secrets: ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"],
      text: "Required. Both values come from one Twitch application.",
    },
    fields: [
      { key: "title", label: "Heading", type: "text", default: "" },
      { key: "channel", label: "Channel", type: "name", default: "", help: "Twitch login name (without twitch.tv/)" },
      { key: "offline", label: "When offline", type: "select", options: ["hide", "show"], default: "hide",
        help: "hide = only visible while live | show = an OFFLINE card linking to the channel" },
      { key: "animation_speed", label: "Animation speed", type: "number", min: 0.2, max: 4.0, step: 0.1, default: 1.0,
        help: "Live indicator pulse speed multiplier" },
    ],
  },
  gists: {
    label: "Gists", help: "Cards for your pinned or latest public gists (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "SNIPPETS" },
      { key: "mode", label: "Which gists", type: "select", options: ["pinned", "recent"], default: "pinned" },
      { key: "limit", label: "Max cards", type: "number", min: 1, max: 12, step: 1, default: 4 },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide" },
    ],
  },
  code: {
    label: "Code", help: "A short code snippet in a terminal-style card",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "" },
      { key: "file", label: "File name", type: "text", default: "hello.c", help: "Shown in the card's title bar" },
      { key: "code", label: "Code", type: "textarea", default: "",
        help: "Up to 24 lines; lines starting with // or # are drawn dimmer (comments)" },
      { key: "link", label: "Link", type: "text", default: "", help: "Optional https:// link for the card, e.g. the gist" },
    ],
  },
  guestbook: {
    label: "Guestbook", help: "Latest comments on a GitHub issue of this repo, with a link to sign it",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "GUESTBOOK" },
      { key: "issue", label: "Issue number", type: "number", min: 0, max: 999999, step: 1, default: 0,
        help: "Open an issue in this repo (e.g. \"Guestbook\") and enter its number; 0 = not set up" },
      { key: "approval", label: "Shown comments", type: "select", options: ["owner", "all"], default: "owner",
        help: "owner = only comments you reacted to with a thumbs up (moderation) | all = every comment" },
      { key: "limit", label: "Max entries", type: "number", min: 1, max: 10, step: 1, default: 5 },
    ],
  },
  counter: {
    label: "Profile Views (Counter)", help: "Visitor counter badge or card (self-hosted tools/counter/ or static count)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "" },
      { key: "label", label: "Badge label", type: "text", default: "PROFILE VIEWS",
        help: "Label shown next to the view counter" },
      { key: "url", label: "Counter server URL", type: "text", default: "",
        help: "https:// address of tools/counter/server.mjs, e.g. https://counter.example.com/counter.svg; empty = offline badge" },
      { key: "fallback_count", label: "Fallback / static count", type: "number", min: 0, max: 99999999, step: 1, default: 0,
        help: "Shown as a local SVG badge when url is empty (0 = hide module until url or count > 0 is set)" },
      { key: "height", label: "Height", type: "number", min: 24, max: 120, step: 2, default: 48 },
    ],
  },
  divider: { label: "Divider", help: "A dotted line", fields: [] },
};

// Module ids become folders in assets/gen next to these.
const RESERVED_IDS = ["tiles", "light"];
/** obj[key] only if obj has that key itself (never an inherited member like "constructor"). */
const own = (obj, key) => (Object.hasOwn(obj, key) ? obj[key] : undefined);

const TYPE_ALIASES = { about: "text", views: "counter" };
export const DEFAULT_LAYOUT = ["banner", "about", "icons", "projects", "releases", "stats"];

/**
 * Every repository secret the workflows read, for the editor's secrets guide.
 * Secrets live in the user's own profile repo (Settings -> Secrets and variables
 * -> Actions); neither settings.txt nor the editor ever holds a value.
 */
export const SECRETS = {
  STEAM_API_KEY: { module: "steam", need: "required",
    what: "Steam Web API key", get: "https://steamcommunity.com/dev/apikey" },
  STEAM_ID64: { module: "steam", need: "optional",
    what: "Your SteamID64, only if you want to keep it out of settings.txt (steam.steam_id)", get: "" },
  MARKET_API_KEY: { module: "portfolio", need: "every provider except yahoo",
    what: "API token of the chosen provider (Tiingo for US listings, EODHD for Xetra/Europe)",
    get: "https://www.tiingo.com/account/api/token", get2: "https://eodhd.com/register" },
  TWITCH_CLIENT_ID: { module: "twitch", need: "required",
    what: "Client ID of a Twitch application", get: "https://dev.twitch.tv/console/apps" },
  TWITCH_CLIENT_SECRET: { module: "twitch", need: "required",
    what: "Client secret of the same application (\"New Secret\")", get: "https://dev.twitch.tv/console/apps" },
};

// Detect accidental plaintext secrets in settings.txt
const SECRET_KEY_PATTERN = /(api[_-]?key|client[_-]?secret|token|password|secret)/i;

// ---------------------------------------------------------- settings.txt --

/**
 * settings.txt text -> {key: value}. One "key = value" per line.
 * Lines starting with "#" are comments (only whole lines, so values like "#ffffff" or "C#" work),
 * "\n" in a value is a line break. The result has no prototype, so keys such as
 * "__proto__" or "constructor" are plain keys and can never reach Object.prototype.
 */
export function parseSettings(text) {
  const settings = Object.create(null);
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq > 0) settings[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/\\n/g, "\n");
  }
  return settings;
}

const comment = (text) => text.split("\n").map((l) => `# ${l}`.trimEnd()).join("\n");
const fieldComment = (f) => [f.help, f.options && `Options: ${f.options.join(" | ")}`].filter(Boolean).join("\n");

/** Flat settings -> settings.txt text with explanations, all options written out. */
export function writeSettings(settings, catalog) {
  const cfg = resolve(settings);
  const out = [comment(
    "Profile settings, read by scripts/build.mjs (and the editor in editor/).\n" +
    'One "key = value" per line, "#" starts a comment, "\\n" is a line break in text.\n' +
    "After a change on main, the Update profile workflow rebuilds README.md and the images.\n" +
    "SECURITY WARNING: Never put API keys or secrets (e.g. STEAM_API_KEY, MARKET_API_KEY, TWITCH_CLIENT_SECRET)\n" +
    "into this file! Always store them in GitHub: Settings -> Secrets and variables -> Actions -> New repository secret.")];

  out.push("", comment("Modules from top to bottom. Remove an id to hide that module (its options stay below).\n" +
    `Types: ${Object.keys(TYPES).join(", ")}. A new module: add an id here and "<id>.type = <type>".`),
    `layout = ${cfg.layout.map((m) => m.id).join(", ")}`);

  out.push("", comment("---- theme ----"));
  for (const f of THEME_FIELDS) out.push(comment(fieldComment(f)), `theme.${f.key} = ${cfg.theme[f.key]}`);

  const ordered = [...cfg.layout, ...cfg.modules.filter((m) => !cfg.layout.includes(m))];
  for (const m of ordered) {
    const hidden = cfg.layout.includes(m) ? "" : " (hidden, not in layout)";
    out.push("", comment(`---- ${m.id}: ${TYPES[m.type].label}${hidden} ----\n${TYPES[m.type].help}`));
    if (TYPES[m.type].secretWarning) {
      out.push(comment(`IMPORTANT: ${TYPES[m.type].secretWarning.text}`));
    }
    // modules without options need the type line, or a hidden one would vanish
    if ((m.id !== m.type && own(TYPE_ALIASES, m.id) !== m.type) || !TYPES[m.type].fields.length) out.push(`${m.id}.type = ${m.type}`);
    for (const f of TYPES[m.type].fields) {
      if (f.type === "icons" && catalog) {
        out.push(comment(`${f.help}\nAvailable, by category:\n` + Object.keys(catalog.categories).map((c) =>
          `  ${c}: ${Object.keys(catalog.icons).filter((k) => catalog.icons[k].category === c).join(", ")}`).join("\n")));
      } else if (fieldComment(f)) out.push(comment(fieldComment(f)));
      out.push(`${m.id}.${f.key} = ${String(m.opt[f.key]).replace(/\n/g, "\\n")}`);
    }
  }
  return out.join("\n") + "\n";
}

/** Flat settings -> {theme, layout: [module], modules: [module]}; module = {id, type, opt}. */
export function resolve(settings) {
  for (const [k, v] of Object.entries(settings)) {
    if (SECRET_KEY_PATTERN.test(k) && String(v).trim()) {
      throw new Error(`Security error: "${k}" looks like a secret or API key. Never store secrets in settings.txt — use GitHub Repository Secrets instead!`);
    }
  }
  const theme = {};
  for (const f of THEME_FIELDS) theme[f.key] = convert(f, settings[`theme.${f.key}`], `theme.${f.key}`);
  if (MATRIX_FONTS.includes(theme.font)) theme.style = "led";
  // The light palette: same theme with the light_* colours.
  const light = { ...theme, fg: theme.light_fg, muted: theme.light_muted, faint: theme.light_faint,
    dim: theme.light_dim, bg: theme.light_bg, border: theme.light_border };
  if (theme.palette === "auto") for (const t of [theme, light]) Object.assign(t, derivePalette(t.fg, t.bg, theme.contrast / 100));
  // Outline colour: auto follows fg (dimmed) until a colour is set. v1.2.1/1.2.2 files also have
  // "theme.outline = auto | custom" next to a default outline_color; that choice still counts.
  const outlineManual = theme.outline_color !== "auto" && settings["theme.outline"] !== "auto";
  // What cards are filled with; bg itself stays a colour (palette mixing, knock-outs like timeline dots).
  for (const t of [theme, light]) {
    t.fill = theme.card_fill === "solid" ? t.bg : "none";
    // edge = the line around cards; outline mode draws it also around headings and the banner
    t.outlined = theme.card_fill === "outline";
    t.edge = !t.outlined ? { color: t.border, opacity: 1, width: 1 }
      : outlineManual ? { color: theme.outline_color, opacity: 1, width: theme.outline_width }
        : { color: t.fg, opacity: OUTLINE_AUTO_OPACITY, width: theme.outline_width };
  }

  const layoutIds = settings.layout !== undefined ? splitList(settings.layout) : DEFAULT_LAYOUT;
  const ids = [...new Set([...layoutIds, ...Object.keys(settings)
    .filter((k) => k.includes(".") && !k.startsWith("theme.")).map((k) => k.split(".")[0])])];

  const modules = ids.map((id) => {
    // ids become folder names in assets/gen, so keep them simple
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error(`Module id "${id}": use letters, digits, - and _ only`);
    // Names of built-in object members ("constructor", "__proto__", ...) are refused as well,
    // so a module can never shadow or reach JavaScript internals.
    if (RESERVED_IDS.includes(id) || id in Object.prototype) throw new Error(`Module id "${id}" is reserved, use another name`);
    const type = settings[`${id}.type`] || own(TYPE_ALIASES, id) || id;
    if (!own(TYPES, type)) throw new Error(`Module "${id}": unknown type "${type}" (add "${id}.type = <type>")`);
    const opt = {};
    for (const f of TYPES[type].fields) opt[f.key] = convert(f, settings[`${id}.${f.key}`], `${id}.${f.key}`);
    if (type === "banner") {
      const effectiveFont = opt.font === "theme" ? theme.font : opt.font;
      if (MATRIX_FONTS.includes(effectiveFont)) opt.style = "led";
    }
    return { id, type, opt };
  });
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]));
  return { theme, light, layout: layoutIds.map((id) => byId[id]), modules };
}

/** Opacity of the automatic outline: the font colour, slightly dimmed. */
export const OUTLINE_AUTO_OPACITY = 0.6;

/** The automatic outline as a solid colour on a background (for the editor's colour swatch). */
export function outlineAutoHex(fg, bg) {
  const a = rgb(fg), b = rgb(bg);
  return "#" + a.map((v, i) => Math.round(v * OUTLINE_AUTO_OPACITY + b[i] * (1 - OUTLINE_AUTO_OPACITY)).toString(16).padStart(2, "0")).join("");
}

/** "#rrggbb" / "#rgb" (an alpha part is ignored) -> [r, g, b] */
export function rgb(hex) {
  const h = hex.slice(1, hex.length === 4 || hex.length === 5 ? 4 : 7);
  return (h.length === 3 ? [...h].map((x) => x + x) : h.match(/../g)).map((x) => parseInt(x, 16));
}

/** palette = auto: secondary colours mixed between bg (0) and fg (1), spread by contrast (0..1). */
function derivePalette(fg, bg, c) {
  const a = rgb(bg), b = rgb(fg);
  const mix = (t) => "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  return { muted: mix(0.55 + 0.4 * c), faint: mix(0.25 + 0.35 * c), dim: mix(0.06 + 0.14 * c), border: mix(0.08 + 0.12 * c) };
}

/**
 * Settings value -> typed option, validated. Values end up in SVG attributes
 * and file paths, so anything unexpected is rejected instead of passed on.
 */
function convert(field, value, name) {
  if (value === undefined || value === "") return field.default;
  const fail = (why) => { throw new Error(`${name} = ${value}: ${why}`); };
  switch (field.type) {
    case "number": {
      const num = Number(value);
      if (!Number.isFinite(num)) fail("not a number");
      return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, num));
    }
    case "color":
      if (field.auto && value === "auto") return "auto"; // follows another colour (outline_color)
      return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fail("use a hex colour like #ffffff");
    case "select": {
      // Backwards-compatible aliases for dissolve_single ("off" -> "keep", "on" -> "more")
      const normalized = field.key === "dissolve_single" && (value === "off" || value === "on")
        ? (value === "on" ? "more" : "keep") : value;
      return field.options.includes(normalized) ? normalized : fail(`use one of ${field.options.join(", ")}`);
    }
    case "toggle":
      return value === "on" || value === "off" ? value : fail("use on or off");
    case "name": // a plain file name without extension, e.g. a font in fonts/
      return /^[\w-]+$/.test(value) ? value : fail("use a plain name (letters, digits, - and _)");
    case "file": // a plain file name inside assets/src, no paths
      return value === "none" || MEDIA_FILE.test(value) ? value : fail("use an image or video file name from assets/src, or none");
    case "portfolio": {
      // Zero-knowledge validation: reject currency symbols (€, $, £, USD, EUR) and ensure weights are valid percentages
      if (/[€$£¥]/.test(value)) fail("never store absolute currency amounts (€/$) in settings.txt; only percentages are allowed");
      for (const [ticker, rest] of splitPairs(value)) {
        if (!/^[A-Za-z0-9._^-]+$/.test(ticker)) fail(`invalid asset ticker "${ticker}"`);
        const [wStr] = rest.split("|").map((s) => s.trim());
        const w = Number(wStr.replace(/%$/, ""));
        if (!Number.isFinite(w) || w < 0 || w > 100) fail(`weight for "${ticker}" must be a percentage between 0 and 100`);
      }
      return value;
    }
    default:
      return value;
  }
}

/** File names allowed in assets/src (no paths): images, animations, videos. */
export const MEDIA_FILE = /^[\w-]+(\.[\w-]+)*\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;
export const isVideo = (file) => /\.(mp4|webm|mov)$/i.test(file);

export const splitList = (value) => String(value).split(",").map((s) => s.trim()).filter(Boolean);

/** "Name | Role | URL | Image, ..." -> [{name, role, url, image}] */
export const splitPeople = (value) => splitList(value).map((entry) => {
  const [name = "", role = "", url = "", image = ""] = entry.split("|").map((s) => s.trim());
  return { name, role, url, image };
});

/** "A | b\\nC | d" (one entry per line) -> [["A", "b"], ["C", "d"]] with `n` columns each. */
export const splitRows = (value, n) => String(value).split("\n").map((l) => l.trim()).filter(Boolean)
  .map((l) => { const c = l.split("|").map((s) => s.trim()); return Array.from({ length: n }, (_, i) => c[i] ?? ""); });

/** GitHub logins referenced as "gh:<login>" images in people modules (for fetch.mjs). */
export const avatarLogins = (cfg) => [...new Set(cfg.modules.filter((m) => m.type === "people")
  .flatMap((m) => splitPeople(m.opt.items)).map((e) => e.image)
  .filter((i) => /^gh:[A-Za-z0-9-]+$/.test(i)).map((i) => i.slice(3)))];

/** "a=1, b=2" -> [["a","1"], ["b","2"]] (values may contain "=", e.g. URLs) */
export const splitPairs = (value) => splitList(value).map((p) => {
  const eq = p.indexOf("=");
  return eq < 0 ? [p.trim(), ""] : [p.slice(0, eq).trim(), p.slice(eq + 1).trim()];
});

/**
 * Parse portfolio allocations ("VWCE.DE=60|FTSE ALL-WORLD, AAPL=40|APPLE")
 * into normalized [{ticker, weight, label}] where weights sum to 100%.
 */
/** Steps finer than this make holdings guessable; the editor advises against them. */
export const PORTFOLIO_SAFE_STEP = 1;

/**
 * Weights (any positive numbers) -> percentages rounded to `step` that add up to
 * exactly 100 (largest remainder method). Used by the editor before saving.
 */
export function roundWeights(values, step = PORTFOLIO_SAFE_STEP) {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const units = Math.round(100 / step);
  const exact = values.map((v) => (Math.max(0, v) / total) * units);
  const out = exact.map(Math.floor);
  let left = units - out.reduce((a, v) => a + v, 0);
  [...exact.keys()].sort((a, b) => (exact[b] % 1) - (exact[a] % 1)).forEach((i) => { if (left > 0) { out[i]++; left--; } });
  return out.map((u) => +(u * step).toFixed(2));
}

/**
 * How much the published weights reveal. Only relative sizes are ever public,
 * but with fine steps and few whole shares the share counts can be guessed.
 *   ok | caution (two positions: their exact ratio is public) | not-recommended (step < 1 %)
 */
export function portfolioRisk(count, step) {
  if (step < PORTFOLIO_SAFE_STEP) return { level: "not-recommended", reason: `weights finer than ${PORTFOLIO_SAFE_STEP} %` };
  if (count === 2) return { level: "caution", reason: "with two positions their ratio is public" };
  return { level: "ok", reason: "" };
}

export function splitPortfolio(value) {
  const raw = splitPairs(value).map(([ticker, rest]) => {
    const [wStr = "0", label = ""] = rest.split("|").map((s) => s.trim());
    const weight = Math.max(0, Number(wStr.replace(/%$/, "")) || 0);
    return { ticker: ticker.toUpperCase(), weight, label: (label || ticker).toUpperCase() };
  }).filter((a) => a.ticker && a.weight > 0);
  const sum = raw.reduce((s, a) => s + a.weight, 0);
  if (sum <= 0) return [];
  return raw.map((a) => ({ ...a, weight: +((a.weight / sum) * 100).toFixed(2) }));
}
