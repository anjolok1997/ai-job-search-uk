# UK location config

`uk-cities.json` is the single source of truth for **which UK locations this fork
searches by default**. It exists so city targeting lives in one editable place
instead of being hard-coded into each portal skill.

## The contract

Portal search skills under `.agents/skills/*` and the `/scrape` workflow honour
this file as follows:

- **No `--location` given** → the portal searches every city listed in
  `defaults` (one query per location) and merges the results.
- **`--location "<place>"` given** → that value overrides the defaults for that
  run. It is passed straight through to the portal, so any location string the
  board itself accepts works (e.g. `--location "Leeds"`,
  `--location "Bristol, UK"`, `--location "Remote"`).

Each portal maps a city's `name` / `aliases` onto its own location parameter
(Adzuna `where=`, Reed `locationName=`, LinkedIn geo id, etc.). The mapping
lives in the individual skill's `url-reference.md`; this file only decides *which
places* are in scope.

## Customising for your own search

This fork ships with a general UK default set so it is useful to anyone who
clones it. To tailor it:

1. **Change the default cities** — edit the `defaults` array. For example, to
   focus on Scotland: `"defaults": ["glasgow", "edinburgh", "remote-uk"]`.
2. **Add a city** — add an entry under `cities` with a `name`, `region`, and any
   `aliases`, then add its key to `defaults`.
3. **Edinburgh** is included in `cities` but left out of `defaults` (marked
   `"optional": true`). Add `"edinburgh"` to `defaults` to switch it on.
4. **Remote** — the `remote-uk` entry carries `"remote": true`; portals that
   have an explicit remote filter use that flag, others fall back to searching
   its `aliases` as location text.

Editing this file is safe to share publicly — it contains no personal data, only
location preferences.
