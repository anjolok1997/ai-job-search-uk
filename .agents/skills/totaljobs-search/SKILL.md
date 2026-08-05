---
name: totaljobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for UK jobs on Totaljobs /
  totaljobs.com, or look up a specific Totaljobs posting. A UK generalist board
  covering every sector (data, engineering, finance, marketing, operations,
  legal, healthcare, etc.) — a good second opinion alongside reed-search for
  broad "data jobs across all sectors" or London coverage. When no location is
  given it searches the UK default cities in config/uk-cities.json (London,
  Manchester, Glasgow, UK-wide); a --location overrides that for one run.
  Trigger phrases: search Totaljobs, totaljobs.com, UK jobs in London /
  Manchester / Glasgow, "any X jobs in <UK place>", look up this Totaljobs posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/totaljobs-search/cli/src/cli.ts *)
---

# Totaljobs Search Skill

Search live job listings from [totaljobs.com](https://www.totaljobs.com), a large UK
generalist job board. No authentication, no API key, and **zero runtime dependencies** — it
runs with just `bun`.

> A UK fork portal skill. Like `reed-search`, `--location` is **optional**: omit it and the
> skill searches the default UK cities declared in `config/uk-cities.json` (the fork's single
> source of truth), de-duplicating across them. Pass `--location` to target one place for that
> run. Use it alongside `reed-search` for broader sector coverage on the same query.

## ⚠️ Personal use only

This uses totaljobs.com's public job pages. Keep volume low and don't use it commercially or
for bulk data collection. Run it on your own responsibility.

## When to use this skill

- Search UK job openings — across the default cities, or in a specific place
- Broaden a `reed-search` query to a second board for wider sector coverage
- Filter by recency (posted within N days) or early-careers only (`--graduate`)
- Get the full description of a specific Totaljobs listing

## Commands

### Search job listings

```bash
bun run .agents/skills/totaljobs-search/cli/src/cli.ts search [--query "<text>"] [--location "<place>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). Recommended.
- `--location <text>` / `-l <text>` — a UK place, e.g. `"London"`, `"Manchester"`.
  **Omit to search the default cities in `config/uk-cities.json`.**
- `--jobage <days>` — keep only jobs posted within N days (client-side). Omit for all postings.
- `--graduate` — early-careers only. Keeps graduate / junior / entry-level / trainee /
  intern / apprentice titles; searches the graduate keyword when `--query` is omitted.
- `--page <n>` — page number (1-indexed, 25 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/totaljobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `107797816`). You may also pass a full
totaljobs.com `job/...` URL. Returns the full description, employment type, posted / closing
dates, salary, and apply link (parsed from the page's JobPosting JSON-LD).

## Usage examples

```bash
# Data roles across the default UK cities, last 14 days
bun run .agents/skills/totaljobs-search/cli/src/cli.ts search -q "data" --jobage 14 --format table

# Data analyst roles in Manchester only
bun run .agents/skills/totaljobs-search/cli/src/cli.ts search -q "data analyst" -l "Manchester" --format table

# Early-careers data roles in London
bun run .agents/skills/totaljobs-search/cli/src/cli.ts search -q "data" -l "London" --graduate --format table

# Full details for a specific job
bun run .agents/skills/totaljobs-search/cli/src/cli.ts detail 107797816 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail`. `meta.locations` lists the places searched. |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from totaljobs.com's public job pages — no credentials required.
- Totaljobs bot-protects detail pages; the CLI always sends a browser `Referer` header (harmless on search, required on detail).
- A default-cities search fetches one page per city and de-duplicates by job ID.
- Totaljobs may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep volume low (see note above).
- Job IDs are numeric (e.g. `107797816`) — pass them as-is to `detail`.
- Default cities come from `config/uk-cities.json`. Edit that file to change which cities a location-less search covers.
