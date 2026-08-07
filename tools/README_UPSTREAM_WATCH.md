# Upstream watch

Weekly triage of upstream commits this fork hasn't picked up yet. It is a
**report only** — it never merges, pushes, or edits code. You read the report
and port anything worth porting by hand. Merges stay a human decision.

## Pieces

| File | Role |
|---|---|
| `.github/workflows/upstream-watch.yml` | Runs weekly (Mon 08:00 UTC) or on demand; fetches upstream, runs the triage, writes the report to a rolling issue on **this** fork. |
| `tools/upstream_triage.py` | The triage logic. Sorts the behind-list into *worth reviewing* vs *probably skip*. Prints Markdown; zero dependencies. |
| `.github/upstream-wontport.txt` | Commits you've consciously decided never to port, so they stop re-appearing. |

## Reading the report

The rolling issue titled **"Upstream sync watch"** has two tables:

- **Worth reviewing** — commits that touch files this fork still ships. Each
  commit links to its upstream diff; the last column lists the fork files it
  touches. These are your porting candidates.
- **Probably skip** — commits demoted with a reason (see below).

## How it decides

A commit lands in *probably skip* when:

| Reason | Meaning |
|---|---|
| `already applied (cherry-picked)` | A matching patch is already in the fork. Detected by `git patch-id` (and subject), so a cherry-pick's new SHA doesn't read as "missing". Drops off automatically once you port it. |
| `on the fork's won't-port list` | Listed in `.github/upstream-wontport.txt`. |
| `touches only files not in this fork` | Every file it changes was removed from this fork (e.g. dropped portals). |
| `changelog-only footprint in this fork` | Its only surviving file here is `CHANGELOG.md`; the real change lives in files this fork removed. |

Everything else is *worth reviewing*. The classification is derived from git at
runtime (touched paths checked against `HEAD`) — there are no hardcoded fork
paths, so the tool is fork-agnostic.

## The won't-port list

When you review a *worth reviewing* commit and decide it will never apply to
this fork, add its SHA to `.github/upstream-wontport.txt` so it stops nagging:

```
cffacfdde   # Danish demo portals - this fork removed them on purpose
```

One SHA per line (short or full); text after `#` is a note. Only for commits
you've reviewed and rejected on purpose — commits you *port* drop off on their
own once cherry-picked, so they never need an entry.

## Running it locally

```sh
git remote add upstream https://github.com/MadsLorentzen/ai-job-search.git
git fetch upstream master
python3 tools/upstream_triage.py --remote upstream --branch master
```

Flags: `--remote` (default `upstream`), `--branch` (default `master`),
`--wontport` (default `.github/upstream-wontport.txt`).

## Notes

- The workflow authenticates with the built-in `GITHUB_TOKEN`, scoped to this
  repo (`contents: read`, `issues: write`). It cannot write outside the fork —
  which is why the digest lands here and not upstream.
- A guard (`if github.repository != 'MadsLorentzen/ai-job-search'`) stops the
  upstream template from ever triaging itself.
