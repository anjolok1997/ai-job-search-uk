# wttj-cli

CLI for searching jobs on [Welcome to the Jungle](https://www.welcometothejungle.com) (WTTJ,
formerly **Otta**) — strong for startup / scale-up and tech roles, with a `--graduate` mode
for early-career hunting.

**Data source**: WTTJ public JSON API (`/api/v3/public/jobs` search, `/api/v3/organizations/<org>/jobs/<slug>` detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.
**UK targeting**: WTTJ's API is global and ignores its own location param, so results are filtered client-side to **GB offices**.

> **Personal use only.** This uses WTTJ's public API. Keep volume low, don't use it commercially
> or for bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/wttj-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search UK (GB-filtered) job listings; `--graduate` for early-career only |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Data engineer roles at UK startups/scale-ups
bun run src/cli.ts search -q "data engineer" --format table

# Graduate software-engineering roles
bun run src/cli.ts search -q "software engineer" --graduate --format table

# Broad UK graduate / early-career scan (no query needed)
bun run src/cli.ts search --graduate -n 20 --format plain

# Full detail for one job
bun run src/cli.ts detail sessions/graduate-operations-executive_london_gouxg6dg --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Required unless `--graduate` is used. |
| `--graduate` | | Early-careers only (graduate / junior / entry-level / intern / apprentice / ≤1 yr experience). |
| `--location` | `-l` | Labels the result `meta` only (WTTJ ignores server-side location). |
| `--jobage` | | Keep only jobs posted within N days (client-side). |
| `--page` | | 1-indexed API page to start scanning from (10/page). |
| `--limit` | `-n` | Cap results emitted (default target 50). |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun test            # unit (mapping, GB filter, graduate heuristic, id parsing) + CLI flag-validation
bun run typecheck   # tsc --noEmit
```
