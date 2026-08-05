# reed-cli

CLI for searching jobs on [reed.co.uk](https://www.reed.co.uk), a major **UK** job board,
across any sector.

**Data source**: reed.co.uk public job pages (`/jobs` search and `/jobs/x/<id>` detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** This uses reed.co.uk's public job pages. Keep volume low, don't use it
> commercially or for bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/reed-search/cli
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
# Data engineer roles across the default UK cities, last 14 days
bun run src/cli.ts search -q "data engineer" --jobage 14 --format table

# Design roles in Manchester only
bun run src/cli.ts search -q "product designer" -l "Manchester" --format table

# Fully remote, permanent
bun run src/cli.ts search -q "technical writer" -l "Remote" --permanent --format table

# Full detail for one job
bun run src/cli.ts detail 57070632 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Recommended. |
| `--location` | `-l` | UK place, e.g. `"London"`, `"Manchester"`, `"Remote"`. Omit to use `config/uk-cities.json`. |
| `--jobage` | | Keep only jobs posted within N days (client-side). |
| `--fulltime` | | Full-time roles only. |
| `--permanent` | | Permanent contracts only. |
| `--graduate` | | Early-careers only (graduate / junior / entry-level / trainee / intern / apprentice). |
| `--page` | | 1-indexed page (25 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun test            # unit (parsing, dates, ids) + CLI flag-validation
bun run typecheck   # tsc --noEmit
```
