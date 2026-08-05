import { join } from "path"
import { readFileSync } from "fs"
import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  jobageToTPR,
  workTypeFlag,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  remote?: string // "remote" | "hybrid" | "onsite"
  graduate?: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

interface LocationTarget {
  location: string
  remote?: string
}

const FALLBACK_TARGETS: LocationTarget[] = [
  { location: "London, England, United Kingdom" },
  { location: "Manchester, England, United Kingdom" },
  { location: "Glasgow, Scotland, United Kingdom" },
  { location: "United Kingdom", remote: "remote" },
]

/**
 * Resolve which LinkedIn places to search when --location is omitted: the
 * `defaults` from config/uk-cities.json (the fork's single source of truth),
 * mapped to LinkedIn-style place strings. A city flagged `remote` becomes a
 * UK-wide search with the remote workplace filter. Falls back to a built-in UK
 * set if the config is missing or unreadable.
 */
export function loadDefaultLocations(): LocationTarget[] {
  try {
    const path = join(import.meta.dir, "../../../../../config/uk-cities.json")
    const cfg = JSON.parse(readFileSync(path, "utf8")) as {
      defaults?: string[]
      cities?: Record<string, { name?: string; region?: string; remote?: boolean }>
    }
    const targets: LocationTarget[] = []
    for (const key of cfg.defaults ?? []) {
      const c = cfg.cities?.[key]
      if (!c?.name) continue
      if (c.remote) {
        targets.push({ location: "United Kingdom", remote: "remote" })
      } else {
        const parts = [c.name, c.region, "United Kingdom"].filter(
          (p): p is string => typeof p === "string" && p.length > 0,
        )
        targets.push({ location: [...new Set(parts)].join(", ") })
      }
    }
    return targets.length ? targets : FALLBACK_TARGETS
  } catch {
    return FALLBACK_TARGETS
  }
}

function buildUrl(opts: SearchOpts, target: LocationTarget): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("keywords", opts.query)
  if (target.location) params.set("location", target.location)
  const tpr = jobageToTPR(opts.jobage)
  if (tpr) params.set("f_TPR", tpr)
  const wt = workTypeFlag(target.remote ?? opts.remote)
  if (wt) params.set("f_WT", wt)
  // Early-careers: LinkedIn experience-level filter — 1=internship, 2=entry level.
  if (opts.graduate) params.set("f_E", "1,2")
  params.set("start", String((opts.page - 1) * 10))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = c.date || "—"
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(24) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const targets: LocationTarget[] = opts.location
      ? [{ location: opts.location, remote: opts.remote }]
      : loadDefaultLocations()

    const seen = new Set<string>()
    let cards: JobCard[] = []
    for (const target of targets) {
      const html = await htmlFetch(buildUrl(opts, target))
      for (const card of parseJobCards(html)) {
        if (seen.has(card.id)) continue
        seen.add(card.id)
        cards.push(card)
      }
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    const locations = targets.map((t) => t.location)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, locations }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
