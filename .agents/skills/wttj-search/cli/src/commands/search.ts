import { join } from "path"
import { readFileSync } from "fs"
import {
  SEARCH_URL,
  jsonFetch,
  mapCard,
  isGB,
  isGraduate,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  graduate?: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const FALLBACK_LOCATIONS = ["London", "Manchester", "Glasgow", "Remote (UK)"]

/**
 * Locations reported in the result meta. WTTJ ignores the server-side location
 * param, so these are for display/parity with the other portal skills only —
 * the actual UK targeting is the client-side GB office filter. Sourced from
 * config/uk-cities.json (the fork's single source of truth).
 */
export function loadDefaultLocations(): string[] {
  try {
    const path = join(import.meta.dir, "../../../../../config/uk-cities.json")
    const cfg = JSON.parse(readFileSync(path, "utf8")) as {
      defaults?: string[]
      cities?: Record<string, { name?: string }>
    }
    const names = (cfg.defaults ?? [])
      .map((key) => cfg.cities?.[key]?.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
    return names.length ? names : FALLBACK_LOCATIONS
  } catch {
    return FALLBACK_LOCATIONS
  }
}

// WTTJ requires a job_title; with no query we scan the general GB-filtered feed.
const GRADUATE_QUERY = "graduate"

// Client-side GB filtering is sparse (~2/10 results), so scan forward across
// pages to fill --limit rather than returning a near-empty first page.
const MAX_PAGES = 15

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 38).padEnd(38)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 16).padEnd(16)
    const salary = (c.salary || "—").slice(0, 20).padEnd(20)
    const date = (c.date || "—").slice(0, 10)
    return `${title} ${company} ${loc} ${salary} ${date}`
  })
  const header =
    "TITLE".padEnd(38) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "LOCATION".padEnd(16) +
    " " +
    "SALARY".padEnd(20) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const locations = opts.location ? [opts.location] : loadDefaultLocations()
    const query = opts.query || (opts.graduate ? GRADUATE_QUERY : "")
    if (!query) {
      writeError(
        "WTTJ search needs a --query (its API requires a job_title). Use --graduate for a broad early-careers scan.",
        "NO_QUERY",
      )
      return 1
    }

    const want = opts.limit !== undefined && opts.limit >= 0 ? opts.limit : 50
    const seen = new Set<string>()
    let cards: JobCard[] = []

    for (let i = 0; i < MAX_PAGES && cards.length < want; i++) {
      const page = opts.page + i
      const url = `${SEARCH_URL}?job_title=${encodeURIComponent(query)}&page=${page}`
      const body = await jsonFetch(url)
      const data: any[] = Array.isArray(body?.data) ? body.data : []
      if (data.length === 0) break

      for (const raw of data) {
        if (!isGB(raw)) continue
        const card = mapCard(raw)
        if (seen.has(card.id)) continue
        if (opts.graduate && !isGraduate(card)) continue
        seen.add(card.id)
        cards.push(card)
      }

      const pageCount = body?.metadata?.page_count
      if (typeof pageCount === "number" && page >= pageCount) break
    }

    if (opts.jobage < 9999) {
      const cutoff = Date.now() - opts.jobage * 86400000
      cards = cards.filter((c) => {
        if (!c.date) return true
        const t = Date.parse(c.date)
        return isNaN(t) ? true : t >= cutoff
      })
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
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
