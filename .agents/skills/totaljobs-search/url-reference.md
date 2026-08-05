# Totaljobs URL Reference

Public, unauthenticated totaljobs.com pages used by this skill. UK-only board.

> Personal use only — keep volume low.

## Search

```
GET https://www.totaljobs.com/jobs/<keywords>/in-<location>?page=<n>
```

Path-based, not query-param — the form `?Keywords=…&Location=…` returns zero cards, so the CLI
slugifies the query and location into the path (`/jobs/data-engineer/in-london`). `page` is
1-indexed (25 results/page); it is omitted for page 1.

Returns an HTML list of job cards. The CLI first strips inline emotion `<style>` blocks (they
reference the `data-at` hooks and would otherwise be mistaken for content), then splits on each
`data-at="job-item"` element and parses per card by its stable `data-at` hooks:
`job-item-title` (title + relative URL), `job-item-company-name`, `job-item-location`,
`job-item-salary-info`, `job-item-timeago`. Each field's text sits after an icon `<svg>`, which
the parser drops.

## Detail

```
GET https://www.totaljobs.com/job/<jobId>
```

Use the **bare numeric id** — `/job/job<id>` 404s, `/job/<id>` resolves. Totaljobs bot-protects
this page and rejects requests with no referer, so the CLI always sends a browser `Referer:
https://www.totaljobs.com/jobs` header. The page embeds a `schema.org` `JobPosting` block in
`<script type="application/ld+json">` (among other ld+json nodes — the CLI selects the
`JobPosting` one); parsed for title, hiring organization, location, employment type, salary
(`baseSalary`), `datePosted`, `validThrough`, and the rich HTML `description` (flattened to text).

## Apply

The detail page's canonical `job/<id>` URL is surfaced as both `url` and `applyUrl` in `detail`
output (Totaljobs routes applications through the same page).

## Notes

- No authentication required.
- Respect rate limits — the CLI backs off on 429/5xx.
- UK-only: `--location` expects a UK place. A location-less search uses `config/uk-cities.json`
  (a city flagged `remote` becomes a UK-wide `/in-uk` search).
