---
name: linkedin-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in any location or
  market, find job listings, or look up a specific job posting — in any country,
  city, or remotely. Invoke for open positions, vacancies, and hiring across any
  sector or role (software, data, design, marketing, finance, legal, operations,
  etc.). Pass a location explicitly, or omit it to search this fork's default UK
  cities from config/uk-cities.json. Trigger phrases: find a job, job search,
  search for jobs, job openings, vacancies, hiring, positions open, remote jobs,
  "are there any X jobs in <place>", look up this job posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/linkedin-search/cli/src/cli.ts *)
---

# LinkedIn Search Skill

Search live job listings from LinkedIn's public job board for **any country/region**
(and remote). No authentication, no API key, and **zero runtime dependencies** — it runs
with just `bun`. Pass any `--location` and the same skill works in any market out of the box.

> LinkedIn's `jobs-guest` endpoints are global and the HTML parsing is country-independent —
> the underlying CLI stays country-agnostic. This UK fork adds one convenience: **omit
> `--location` and it searches the default cities in `config/uk-cities.json`** (London,
> Manchester, Glasgow, Remote-UK), de-duplicating across them. Pass `--location` to target
> any single place, in the UK or elsewhere.

## ⚠️ Personal use only

This uses LinkedIn's public job pages; automated access is against LinkedIn's Terms of
Service, so **keep volume low and don't use it commercially or for bulk data collection.**
Run it on your own responsibility.

## When to use this skill

- Search for job openings in a given location (any country/city) or remotely
- Filter by recency (posted today / last 7 / 14 / 30 days) or workplace type (remote/hybrid/onsite)
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/linkedin-search/cli/src/cli.ts search [--location "<place>"] [flags]
```

Key flags:
- `--location <text>` / `-l <text>` — a LinkedIn place string, e.g. `"Mumbai, Maharashtra, India"`, `"Berlin, Germany"`, `"London, United Kingdom"`, or `"Remote"`. **Omit to search the default UK cities in `config/uk-cities.json`** (de-duplicated; the remote default becomes a UK-wide search with the remote filter).
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). Recommended.
- `--jobage <days>` — posted within N days: `1`, `7`, `14`, `30`. Omit for all postings.
- `--remote <mode>` — `remote`, `hybrid`, or `onsite` (workplace-type filter).
- `--graduate` — early-careers only (LinkedIn internship + entry-level experience filter).
- `--page <n>` — page number (1-indexed, 10 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/linkedin-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job ID from `search` results (e.g. `4426311357`). You may also pass a full
LinkedIn `jobs/view/...` URL or a `urn:li:jobPosting:...` URN. Returns the full description,
seniority, employment type, job function, industries, and apply link.

## Usage examples

```bash
# Data engineer roles across the default UK cities, last 30 days
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q "data engineer" --jobage 30 --format table

# Data engineer roles in Bengaluru, last 30 days
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q "data engineer" -l "Bengaluru, Karnataka, India" --jobage 30 --format table

# Product manager roles in Berlin, remote
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q "product manager" -l "Berlin, Germany" --remote remote --format table

# Any role, fully remote
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q "paralegal" -l "Remote" --format table

# Full details for a specific job
bun run .agents/skills/linkedin-search/cli/src/cli.ts detail 4426311357 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from LinkedIn's public `jobs-guest` endpoints — no credentials required.
- Page size is fixed at 10 results per page; a default-cities search fetches one page per city and de-duplicates by job ID.
- Default cities come from `config/uk-cities.json`. Edit that file to change which cities a location-less search covers.
- LinkedIn may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep volume low (see ToS note above).
- Job IDs are numeric (e.g. `4426311357`) — pass them as-is to `detail`.
