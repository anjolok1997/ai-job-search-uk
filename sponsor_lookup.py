#!/usr/bin/env python3
"""
UK Visa Sponsor Lookup Tool

Checks whether a company appears on the UK government's public
"Register of licensed sponsors (Workers)" — the definitive list of employers
that hold a Skilled Worker / Temporary Worker sponsor licence. Used by the
Sponsorship Gate in .claude/skills/job-application-assistant/04-job-evaluation.md
to turn a posting that is *silent* on sponsorship into a ranked likelihood:
a company on the register can sponsor, so a silent posting is far more promising.

Data source: gov.uk, refreshed daily and downloaded on demand. No API key, no
third-party dependencies (Python standard library only). The CSV (~140k rows) is
cached under job_scraper/ and refreshed once per calendar day.

Usage:
    python sponsor_lookup.py "Company Name"
    python sponsor_lookup.py "Company Name" --city London
    python sponsor_lookup.py "Company Name" --json
    python sponsor_lookup.py "Company Name" --refresh   # force re-download
"""

import argparse
import csv
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

LANDING_URL = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"
CACHE_DIR = Path(__file__).parent / "job_scraper"
CACHE_CSV = CACHE_DIR / "sponsor_register.csv"
CACHE_META = CACHE_DIR / "sponsor_register.meta.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Legal suffixes / noise stripped before matching a company name.
STRIP_PATTERNS = [
    r"\blimited\b", r"\bltd\b", r"\bplc\b", r"\bllp\b", r"\bllc\b",
    r"\bllp\b", r"\bcic\b", r"\bcio\b", r"\bt/a\b", r"\bthe\b",
    r"\bgroup\b", r"\bholdings?\b", r"\buk\b", r"\bgb\b",
    r"\(.*?\)",
]


def _fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def discover_csv_url():
    """Find the current register CSV link on the gov.uk landing page."""
    html = _fetch(LANDING_URL).decode("utf-8", errors="replace")
    m = re.search(r'https://assets\.publishing\.service\.gov\.uk/[^"]+\.csv', html)
    if not m:
        raise RuntimeError("Could not find the register CSV link on the gov.uk page.")
    return m.group(0)


def refresh_cache(force=False):
    """Download the register CSV if the cache is missing or from an earlier day."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    if not force and CACHE_CSV.exists() and CACHE_META.exists():
        try:
            meta = json.loads(CACHE_META.read_text(encoding="utf-8"))
            if meta.get("fetched") == today:
                return meta
        except (json.JSONDecodeError, OSError):
            pass

    csv_url = discover_csv_url()
    data = _fetch(csv_url)
    CACHE_CSV.write_bytes(data)
    meta = {"fetched": today, "source": csv_url}
    CACHE_META.write_text(json.dumps(meta), encoding="utf-8")
    return meta


def load_register():
    """Yield register rows as dicts. Assumes refresh_cache() already ran."""
    with open(CACHE_CSV, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            yield {(k or "").strip(): (v or "").strip() for k, v in row.items()}


def normalize(s):
    s = (s or "").lower().strip()
    for pat in STRIP_PATTERNS:
        s = re.sub(pat, " ", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


def core_words(s):
    s = (s or "").lower()
    for pat in STRIP_PATTERNS:
        s = re.sub(pat, " ", s)
    return [w for w in re.findall(r"[a-z0-9]+", s) if len(w) > 1]


def match_score(q_norm, q_words, name):
    """0-100 confidence that `name` is the queried company.

    Word-primary: an exact normalized match wins; otherwise we rank by whole-word
    overlap, never raw character-substring — so "Monzo" does not match "Onzo".
    """
    n_norm = normalize(name)
    if not q_norm or not n_norm:
        return 0
    if q_norm == n_norm:
        return 100
    q_set, n_set = set(q_words), set(core_words(name))
    if not q_set or not n_set:
        return 0
    if q_set <= n_set:
        # Every query word appears as a whole word in the name.
        if len(q_set) == 1:
            # A single generic word is only a strong signal in a short name.
            return 85 if len(n_set) <= 2 else 65
        return 90
    overlap = q_set & n_set
    if not overlap or len(q_set) == 1:
        return 0
    return int(30 + (len(overlap) / len(q_set)) * 40)


def confidence_label(score):
    if score >= 100:
        return "exact"
    if score >= 80:
        return "strong"
    if score >= 55:
        return "partial"
    return "none"


def search(query, city=None, min_score=55):
    q_norm = normalize(query)
    q_words = core_words(query)
    scored = []
    for row in load_register():
        name = row.get("Organisation Name", "")
        if city:
            row_city = row.get("Town/City", "").lower()
            if city.lower() not in row_city:
                continue
        score = match_score(q_norm, q_words, name)
        if score >= min_score:
            scored.append((score, row))
    scored.sort(key=lambda x: (-x[0], x[1].get("Organisation Name", "")))
    return scored


def group_matches(scored):
    """Collapse duplicate org rows (same employer, multiple routes) into one entry."""
    grouped = {}
    for score, row in scored:
        key = (row.get("Organisation Name", ""), row.get("Town/City", ""))
        entry = grouped.setdefault(
            key,
            {
                "organisation": row.get("Organisation Name", ""),
                "town_city": row.get("Town/City", ""),
                "county": row.get("County", ""),
                "rating": row.get("Type & Rating", ""),
                "routes": [],
                "score": score,
            },
        )
        route = row.get("Route", "")
        if route and route not in entry["routes"]:
            entry["routes"].append(route)
        entry["score"] = max(entry["score"], score)
    return sorted(grouped.values(), key=lambda e: (-e["score"], e["organisation"]))


def main():
    parser = argparse.ArgumentParser(description="UK visa sponsor register lookup")
    parser.add_argument("company", nargs="?", help="Company name to check")
    parser.add_argument("--city", help="Disambiguate by Town/City")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--refresh", action="store_true", help="Force re-download of the register")
    args = parser.parse_args()

    if not args.company:
        parser.print_help()
        sys.exit(1)

    try:
        meta = refresh_cache(force=args.refresh)
    except Exception as exc:  # network / parse failures should not crash the caller
        print(json.dumps({"error": f"could not load sponsor register: {exc}", "code": "REGISTER_UNAVAILABLE"}), file=sys.stderr)
        sys.exit(1)

    scored = search(args.company, args.city)
    matches = group_matches(scored)
    best = matches[0]["score"] if matches else 0

    if args.json:
        print(json.dumps({
            "query": args.company,
            "licensed_sponsor": bool(matches),
            "confidence": confidence_label(best),
            "matches": [{k: v for k, v in m.items()} for m in matches[:10]],
            "as_of": meta.get("fetched"),
            "source": meta.get("source"),
        }, ensure_ascii=False, indent=2))
        return

    if not matches:
        print(f"'{args.company}' is NOT on the Register of Licensed Sponsors"
              + (f" in {args.city}" if args.city else "") + ".")
        print("This does not prove they can't sponsor (names may differ, or they may hold a")
        print("licence under a parent entity) — but there's no positive signal from the register.")
        sys.exit(0)

    print(f"'{args.company}' — likely a licensed sponsor "
          f"({confidence_label(best)} match, register as of {meta.get('fetched')}):\n")
    for m in matches[:10]:
        loc = m["town_city"] + (f", {m['county']}" if m["county"] else "")
        print(f"  {m['organisation']}  [{loc}]")
        print(f"    {m['rating']} — routes: {', '.join(m['routes']) or 'n/a'}")
    print("\nSource: gov.uk Register of licensed sponsors (Workers).")


if __name__ == "__main__":
    main()
