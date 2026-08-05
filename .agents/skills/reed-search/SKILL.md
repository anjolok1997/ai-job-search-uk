---
name: reed-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for UK jobs, find job
  listings on Reed / reed.co.uk, or look up a specific Reed job posting. Invoke
  for open positions, vacancies, and hiring across any UK sector or role
  (software, data, design, marketing, finance, legal, operations, etc.). When no
  location is given it searches the UK default cities in config/uk-cities.json
  (London, Manchester, Glasgow, Remote); a --location overrides that for one run.
  Trigger phrases: find a UK job, search Reed, reed.co.uk, jobs in London /
  Manchester / Glasgow, UK job openings, UK vacancies, "are there any X jobs in
  <UK place>", look up this Reed posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/reed-search/cli/src/cli.ts *)
---

# Reed Search Skill

Search live job listings from [reed.co.uk](https://www.reed.co.uk), one of the UK's
largest job boards. No authentication, no API key, and **zero runtime dependencies** — it
runs with just `bun`.

> This is the UK fork's flagship portal skill. Unlike the country-agnostic `linkedin-search`
> example, `--location` is **optional**: omit it and the skill searches the default UK cities
> declared in `config/uk-cities.json` (the fork's single source of truth), de-duplicating
> across them. Pass `--location` to target one place for that run.

## ⚠️ Personal use only

This uses reed.co.uk's public job pages. Keep volume low and don't use it commercially or
for bulk data collection. Run it on your own responsibility.

## When to use this skill

- Search UK job openings — across the default cities, or in a specific place / remotely
- Filter by recency (posted within N days), full-time only, or permanent only
- Get the full description of a specific Reed job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/reed-search/cli/src/cli.ts search [--query "<text>"] [--location "<place>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). Recommended.
- `--location <text>` / `-l <text>` — a UK place, e.g. `"London"`, `"Manchester"`, `"Remote"`.
  **Omit to search the default cities in `config/uk-cities.json`.**
- `--jobage <days>` — keep only jobs posted within N days (client-side). Omit for all postings.
- `--fulltime` — full-time roles only.
- `--permanent` — permanent contracts only.
- `--graduate` — early-careers only. Keeps graduate / junior / entry-level / trainee /
  intern / apprentice titles; searches the graduate keyword when `--query` is omitted.
- `--page <n>` — page number (1-indexed, 25 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/reed-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job ID from `search` results (e.g. `57070632`). You may also pass a full
reed.co.uk `jobs/...` URL. Returns the full description, employment type, posted / closing
dates, and apply link (parsed from the page's JobPosting JSON-LD).

## Usage examples

```bash
# Data engineer roles across the default UK cities, last 14 days
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "data engineer" --jobage 14 --format table

# Product manager roles in Manchester only
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "product manager" -l "Manchester" --format table

# Permanent paralegal roles, remote
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "paralegal" -l "Remote" --permanent --format table

# Full details for a specific job
bun run .agents/skills/reed-search/cli/src/cli.ts detail 57070632 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail`. `meta.locations` lists the places searched. |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from reed.co.uk's public job pages — no credentials required.
- Page size is fixed at 25 results per page; a default-cities search fetches one page per city and de-duplicates by job ID.
- Reed may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep volume low (see note above).
- Job IDs are numeric (e.g. `57070632`) — pass them as-is to `detail`.
- Default cities come from `config/uk-cities.json`. Edit that file to change which cities a location-less search covers.
