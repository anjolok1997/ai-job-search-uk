---
name: wttj-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Welcome to the Jungle (WTTJ,
  formerly Otta) for jobs, or look up a specific WTTJ posting. Strong for
  startup / scale-up and tech roles (engineering, data, product, design), and
  for graduate / early-career hunting via the --graduate flag. Results are
  filtered to UK (GB) offices. Trigger phrases: search Welcome to the Jungle,
  WTTJ, Otta, startup jobs, scale-up jobs, graduate jobs, grad scheme,
  entry-level / junior roles, "any graduate X jobs", look up this WTTJ posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/wttj-search/cli/src/cli.ts *)
---

# Welcome to the Jungle Search Skill

Search live job listings from [Welcome to the Jungle](https://www.welcometothejungle.com)
(WTTJ, which absorbed **Otta**), via its **public JSON API**. No authentication, no API key,
and **zero runtime dependencies** — it runs with just `bun`.

> WTTJ's search API is global and **ignores** its own `location` parameter, so this skill
> targets the UK by filtering results **client-side to GB offices**. Because GB roles are a
> minority of the global feed, `search` scans forward across API pages to fill `--limit`.
> The `--location` flag only labels the result `meta` (parity with the other portal skills);
> it does not change what the server returns.

## ⚠️ Personal use only

This uses WTTJ's public API. Keep volume low and don't use it commercially or for bulk data
collection. Run it on your own responsibility.

## When to use this skill

- Search UK startup / scale-up and tech job openings on WTTJ (ex-Otta)
- Hunt **graduate / early-career** roles with `--graduate` (grad schemes, junior, entry-level,
  intern, apprentice, or roles asking ≤1 year experience)
- Filter by recency (posted within N days)
- Get the full description of a specific WTTJ listing

## Commands

### Search job listings

```bash
bun run .agents/skills/wttj-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). **Required** by WTTJ's
  API — except when `--graduate` is used, which supplies a broad early-careers query for you.
- `--graduate` — early-careers only. Keeps roles whose title reads graduate / junior /
  entry-level / trainee / intern / apprentice, whose contract is an internship or
  apprenticeship, or that ask for ≤1 year of experience. Combine with `-q` to narrow
  (e.g. `-q "software engineer" --graduate`), or use alone for a broad graduate scan.
- `--location <text>` / `-l <text>` — labels the result `meta` only (see note above).
- `--jobage <days>` — keep only jobs posted within N days (client-side). Omit for all postings.
- `--page <n>` — 1-indexed API page to start scanning from (default 1).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side; default target 50).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/wttj-search/cli/src/cli.ts detail <org/slug|url> [--format json|plain]
```

`id` is the `<org>/<slug>` reference from `search` results
(e.g. `sessions/graduate-operations-executive_london_gouxg6dg`). You may also pass a full
WTTJ or API URL. Returns the full description, contract type, remote policy, minimum
experience, education level, salary, and apply link.

## Usage examples

```bash
# Data engineer roles at UK startups/scale-ups
bun run .agents/skills/wttj-search/cli/src/cli.ts search -q "data engineer" --format table

# Graduate software engineering roles (narrowed)
bun run .agents/skills/wttj-search/cli/src/cli.ts search -q "software engineer" --graduate --format table

# Broad UK graduate / early-career scan
bun run .agents/skills/wttj-search/cli/src/cli.ts search --graduate -n 20 --format plain

# Full details for a specific job
bun run .agents/skills/wttj-search/cli/src/cli.ts detail sessions/graduate-operations-executive_london_gouxg6dg --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail`. `meta.locations` lists the labelled places. |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from WTTJ's public API — no credentials required.
- WTTJ pages at 10 results per API page and ignores server-side location; UK targeting is a
  client-side GB-office filter, so `search` scans forward (up to 15 pages) to fill `--limit`.
- WTTJ may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep volume low (see note above).
- Job IDs are `<org>/<slug>` (e.g. `sessions/graduate-operations-executive_london_gouxg6dg`) — pass them as-is to `detail`.
- The `--graduate` heuristic is title/contract/experience based; WTTJ has no single "graduate" field, so it errs toward inclusion.
