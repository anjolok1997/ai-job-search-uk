# totaljobs-cli

CLI for searching jobs on [totaljobs.com](https://www.totaljobs.com), a large **UK** generalist
job board, across any sector.

**Data source**: totaljobs.com public job pages (`/jobs/<kw>/in-<loc>` search and `/job/<id>` detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** This uses totaljobs.com's public job pages. Keep volume low, don't use it
> commercially or for bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/totaljobs-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for UK job listings (`--location` optional — defaults to `config/uk-cities.json`) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Data roles across the default UK cities, last 14 days
bun run src/cli.ts search -q "data" --jobage 14 --format table

# Data analyst roles in Manchester only
bun run src/cli.ts search -q "data analyst" -l "Manchester" --format table

# Early-careers data roles in London
bun run src/cli.ts search -q "data" -l "London" --graduate --format table

# Full detail for one job
bun run src/cli.ts detail 107797816 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Recommended. |
| `--location` | `-l` | UK place, e.g. `"London"`, `"Manchester"`. Omit to use `config/uk-cities.json`. |
| `--jobage` | | Keep only jobs posted within N days (client-side). |
| `--graduate` | | Early-careers only (graduate / junior / entry-level / trainee / intern / apprentice). |
| `--page` | | 1-indexed page (25 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Notes

- Totaljobs bot-protects detail pages; the CLI always sends a browser `Referer` header (harmless on search, required on detail).
- Detail requires the **bare numeric id** (`/job/<id>`), which the CLI derives from any search-result id or URL.

## Tests

```bash
bun test            # unit (parsing, dates, ids, url building) + CLI flag-validation
bun run typecheck   # tsc --noEmit
```
