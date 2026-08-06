// Data source: Welcome to the Jungle (ex-Otta) public JSON API. No auth, no key.
// Search:  GET https://api.welcometothejungle.com/api/v3/public/jobs?job_title=<q>&page=<n>
//          (per_page is fixed at 10; the `location` param is accepted but ignored,
//           so UK targeting is a client-side office.country_code=="GB" filter.)
// Detail:  GET https://api.welcometothejungle.com/api/v3/organizations/<org>/jobs/<slug>
//          (the public HTML page is bot-blocked; the org-scoped JSON endpoint is not.)

export const API = "https://api.welcometothejungle.com/api/v3"
export const SEARCH_URL = `${API}/public/jobs`
export const SITE = "https://www.welcometothejungle.com/en/companies"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "wttj-search-skill/1.0 (+https://github.com/anjolok1997/ai-job-search-uk)"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch(url: string): Promise<any | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string // "<orgSlug>/<jobSlug>" — the reference the detail command consumes
  title: string
  company: string | null
  location: string | null
  salary: string | null
  date: string | null
  remote: string | null
  contractType: string | null
  experienceMin: number | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  educationLevel: string | null
  applyUrl: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** Turn the HTML description WTTJ returns into readable plain text. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(
    withBreaks.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** A raw WTTJ office block, from `office` or an entry of `offices`. */
interface Office {
  city?: string
  country_code?: string
}

function offices(raw: any): Office[] {
  const list: Office[] = []
  if (raw?.office) list.push(raw.office)
  if (Array.isArray(raw?.offices)) list.push(...raw.offices)
  return list
}

/** True when any of the job's offices is in Great Britain. */
export function isGB(raw: any): boolean {
  return offices(raw).some((o) => (o?.country_code || "").toUpperCase() === "GB")
}

function formatLocation(raw: any): string | null {
  const all = offices(raw)
  const gb = all.find((o) => (o?.country_code || "").toUpperCase() === "GB") || all[0]
  if (!gb) return raw?.remote === "fulltime" ? "Remote" : null
  const parts = [gb.city, gb.country_code].filter(Boolean)
  return parts.join(", ") || null
}

function formatSalary(raw: any): string | null {
  const min = raw?.salary_min
  const max = raw?.salary_max
  if (min == null && max == null) return null
  const cur = raw?.salary_currency || ""
  const per = raw?.salary_period ? `/${String(raw.salary_period).replace("yearly", "yr").replace("monthly", "mo")}` : ""
  const money = (n: number) => `${cur} ${n.toLocaleString("en-GB")}`.trim()
  if (min != null && max != null && min !== max) return `${money(min)}–${money(max)}${per}`
  return `${money(min ?? max)}${per}`
}

/** Map a raw search/detail job object to a JobCard. */
export function mapCard(raw: any): JobCard {
  const orgSlug = raw?.organization?.slug || ""
  const jobSlug = raw?.slug || ""
  return {
    id: orgSlug && jobSlug ? `${orgSlug}/${jobSlug}` : jobSlug,
    title: raw?.name ? decodeHtmlEntities(String(raw.name)).trim() : "(untitled)",
    company: raw?.organization?.name ? String(raw.organization.name).trim() : null,
    location: formatLocation(raw),
    salary: formatSalary(raw),
    date: raw?.published_at || null,
    remote: raw?.remote || null,
    contractType: raw?.contract_type || null,
    experienceMin: typeof raw?.experience_min === "number" ? raw.experience_min : null,
    url: orgSlug && jobSlug ? `${SITE}/${orgSlug}/jobs/${jobSlug}` : SITE,
  }
}

const GRADUATE_RE =
  /\b(graduate|grad\s*scheme|junior|entry[-\s]?level|trainee|intern(ship)?|apprentice(ship)?|placement|early\s*career)/i

/**
 * Early-career heuristic for the --graduate filter. A job qualifies when its
 * title reads as graduate/junior/entry-level, its contract is an internship or
 * apprenticeship, or it asks for at most ~1 year of experience.
 */
export function isGraduate(card: JobCard): boolean {
  if (GRADUATE_RE.test(card.title)) return true
  const c = (card.contractType || "").toLowerCase()
  if (c === "internship" || c === "apprenticeship") return true
  return card.experienceMin != null && card.experienceMin <= 1
}

/** Parse "<org>/<slug>", an API URL, or a public WTTJ URL into {org, slug}. */
export function parseDetailRef(input: string): { org: string; slug: string } | null {
  const s = input.trim()
  const url =
    s.match(/organizations\/([^/]+)\/jobs\/([^/?#]+)/i) ||
    s.match(/companies\/([^/]+)\/jobs\/([^/?#]+)/i)
  if (url) return { org: url[1], slug: url[2] }
  const bare = s.match(/^([^/\s]+)\/([^/\s?#]+)$/)
  if (bare) return { org: bare[1], slug: bare[2] }
  return null
}

/** Map a raw detail `job` object to a JobDetail. */
export function parseJobDetail(raw: any): JobDetail {
  const card = mapCard(raw)
  const description = raw?.description ? htmlToText(String(raw.description)) || null : null
  return {
    ...card,
    description,
    educationLevel: raw?.education_level || null,
    applyUrl: raw?.apply_url || card.url,
  }
}
