import { join } from "path"
import { readFileSync } from "fs"
import {
  buildSearchUrl,
  htmlFetch,
  parseJobCards,
  dateToDaysAgo,
  isGraduateTitle,
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

const FALLBACK_LOCATIONS = ["London", "Manchester", "Glasgow", "UK"]

/**
 * Resolve which locations to search when --location is omitted: the `defaults`
 * from config/uk-cities.json (the fork's single source of truth). A city
 * flagged `remote` becomes a UK-wide search. Falls back to a built-in UK set if
 * the config is missing or unreadable.
 */
export function loadDefaultLocations(): string[] {
  try {
    const path = join(import.meta.dir, "../../../../../config/uk-cities.json")
    const cfg = JSON.parse(readFileSync(path, "utf8")) as {
      defaults?: string[]
      cities?: Record<string, { name?: string; remote?: boolean }>
    }
    const names = (cfg.defaults ?? [])
      .map((key) => {
        const c = cfg.cities?.[key]
        if (!c?.name) return undefined
        return c.remote ? "UK" : c.name
      })
      .filter((n): n is string => typeof n === "string" && n.length > 0)
    return names.length ? [...new Set(names)] : FALLBACK_LOCATIONS
  } catch {
    return FALLBACK_LOCATIONS
  }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 38).padEnd(38)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const salary = (c.salary || "—").slice(0, 22).padEnd(22)
    const date = c.date || "—"
    return `${c.id.padEnd(10)} ${title} ${company} ${loc} ${salary} ${date}`
  })
  const header =
    "ID".padEnd(10) +
    " " +
    "TITLE".padEnd(38) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(18) +
    " " +
    "SALARY".padEnd(22) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const locations = opts.location ? [opts.location] : loadDefaultLocations()

    // --graduate with no query: search the graduate keyword directly.
    if (opts.graduate && !opts.query) opts = { ...opts, query: "graduate" }

    const seen = new Set<string>()
    let cards: JobCard[] = []
    for (const location of locations) {
      const html = await htmlFetch(buildSearchUrl(opts.query, location, opts.page))
      for (const card of parseJobCards(html)) {
        if (seen.has(card.id)) continue
        seen.add(card.id)
        cards.push(card)
      }
    }

    if (opts.graduate) cards = cards.filter((c) => isGraduateTitle(c.title))

    if (opts.jobage < 9999) {
      cards = cards.filter((c) => {
        const d = dateToDaysAgo(c.date)
        return d === null ? true : d <= opts.jobage
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
