# Handoff

Working notes for whoever continues (human or AI). Keep "Open" current.

## What this is

**profile-matrix**: dot-matrix (LED) GitHub profile READMEs generated from one
`settings.txt`. People design theirs in the hosted editor, copy the
`profile-matrix` template and upload the file.

```
profile-matrix-config (this repo, source)  --release.yml-->  GitHub Pages (editor)
                                            --release.yml-->  MatteoKaul/profile-matrix (template)
<user>/<user> = copy of the template + own settings.txt; profile.yml builds daily
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Design rules for the
look (also for other projects): [docs/design-essence.txt](docs/design-essence.txt).

## Rules

- Repo content in English; the owner talks German.
- One settings format: `settings.txt` (`key = value`). No JSON configs.
- No personal data in this repo or the template: examples stay generic
  (lorem ipsum, example.com, octocat). The owner's own settings live only in
  MatteoKaul/MatteoKaul.
- Keys only as repository secrets; the editor never has a field for a key.
- Conventional Commits: `feat:`/`fix:`/`perf:`/`refactor:` on `main` release
  (Pages + template); `docs:`/`chore:`/`ci:`/`test:` do not.
- Run `node tools/check.mjs` before pushing. Actions are pinned to commit SHAs.
- Optional data steps (Steam, market, Twitch) must never fail the build
  (`scripts/lib/optional.mjs`).

## Open

- [ ] First real runs against live APIs: `fetch.mjs`, `live.mjs`,
      `market.mjs`, `steam.mjs` are only tested with mocked responses.
- [ ] Editor layout in Safari: fixed for WebKit's `<select>` sizing, but only
      tested in Chromium (no WebKit in the dev container). Owner checks.
- [ ] Portfolio index applies the weights every day (daily rebalanced). Decide
      whether to let weights drift with prices between settings changes
      (closer to a real buy-and-hold depot).
- [ ] Template copies do not update themselves (sync workflow or versioned action).
- [ ] Editor: ZIP download with settings.txt + used images from `assets/src/`.
- [ ] Module 4: `username` / `display_name` override (`auto` = repo owner).
- [ ] Module 6: issue forms, PR template, CODEOWNERS, CONTRIBUTING, SECURITY,
      plus ruleset "Require review from Code Owners" on `main`.
