# Reed Jobs URL Reference

Public, unauthenticated reed.co.uk pages used by this skill. UK-only board.

> Personal use only — keep volume low.

## Search

```
GET https://www.reed.co.uk/jobs
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `keywords` | Free-text query | `data engineer` |
| `location` | UK place string | `London` · `Manchester` · `Remote` |
| `fullTime` | Full-time roles only | `true` |
| `permanent` | Permanent contracts only | `true` |
| `sortby` | Result ordering | `DisplayDate` (newest first) |
| `pageno` | 1-indexed page (25/page) | `1`, `2`, `3`, … |

Returns an HTML list of job cards. The CLI splits on each `<article data-qa="job-card">`
and parses per card by its stable `data-qa` hooks: `data-id="job<id>"`, `job-card-title`
(title + URL), `job-posted-by` (date + company), `job-metadata-location`, `job-metadata-salary`.

## Detail

```
GET https://www.reed.co.uk/jobs/x/<jobId>
```

Any slug works in place of `x` — Reed resolves by the trailing numeric id. The page embeds a
`schema.org` `JobPosting` block in `<script type="application/ld+json">`; the CLI parses it
for title, hiring organization, location, employment type, `datePosted`, `validThrough`, and
the rich HTML `description` (flattened to text).

## Apply

```
https://www.reed.co.uk/jobs/apply/<jobId>
```

Surfaced as `applyUrl` in `detail` output.

## Notes

- No authentication required. (Reed also offers a free keyed API, but this skill uses the public site.)
- Respect rate limits — the CLI backs off on 429/5xx.
- UK-only: `--location` expects a UK place. A location-less search uses `config/uk-cities.json`.
