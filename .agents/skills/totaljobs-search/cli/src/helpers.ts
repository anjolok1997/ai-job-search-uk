// Data source: totaljobs.com public job pages. No authentication, no API key.
// Search returns an HTML list of job cards (parsed from stable data-at hooks);
// detail returns a single job's page, which carries a JobPosting JSON-LD block
// we parse for structured fields. Totaljobs bot-protects detail pages, so every
// request sends a Referer header (harmless on search, required on detail).

export const BASE = "https://www.totaljobs.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        // Totaljobs rejects detail requests with no referer (bot protection).
        Referer: `${BASE}/jobs`,
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
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  salary: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  validThrough: string | null
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

/** Strip a card field to its leading text: drop icon SVGs and any tags, and
 * cut at the first dangling/child tag so a sibling element can't bleed in. */
function fieldText(html: string): string {
  let s = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " ")
  s = s.split("<")[0] // drop a trailing unclosed tag from the capture window
  return decodeHtmlEntities(s).replace(/\s+/g, " ").trim()
}

function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Slugify a keyword/location for Totaljobs' path-based search URLs. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Build a Totaljobs search URL: /jobs/<keywords>/in-<location>?page=N. */
export function buildSearchUrl(query: string | undefined, location: string, page: number): string {
  const kw = query ? slugify(query) : "jobs"
  const loc = slugify(location)
  const path = loc ? `/jobs/${kw}/in-${loc}` : `/jobs/${kw}`
  return `${BASE}${path}${page > 1 ? `?page=${page}` : ""}`
}

/** Build a canonical Totaljobs detail URL from a numeric id. */
export function detailUrlFromId(id: string): string {
  return `${BASE}/job/${id}`
}

/** Totaljobs' job id from a URL, path, or bare number. */
export function normalizeId(input: string): string | null {
  const m =
    input.match(/-job(\d{5,})\b/) || input.match(/\/job\/(\d{5,})\b/) || input.match(/(\d{6,})/)
  return m ? m[1] : null
}

const GRADUATE_RE =
  /\b(graduate|grad\s*scheme|junior|entry[-\s]?level|trainee|intern(ship)?|apprentice(ship)?|placement|early\s*career)/i

/** Early-career heuristic for the --graduate filter (title-based; Totaljobs
 * exposes no experience field on the search card). */
export function isGraduateTitle(title: string): boolean {
  return GRADUATE_RE.test(title || "")
}

/**
 * Turn a relative Totaljobs card date label into whole days since posting.
 * Totaljobs labels recent posts relatively ("4 hours ago", "1 day ago",
 * "Today", "Yesterday"). Returns null when a date cannot be determined.
 */
export function dateToDaysAgo(label: string | null): number | null {
  if (!label) return null
  const s = label.trim().toLowerCase()
  if (/just now|today|hour|minute|moment/.test(s)) return 0
  if (/yesterday/.test(s)) return 1
  const rel = s.match(/(\d+)\s*day/)
  if (rel) return parseInt(rel[1], 10)
  const wk = s.match(/(\d+)\s*week/)
  if (wk) return parseInt(wk[1], 10) * 7
  const mo = s.match(/(\d+)\s*month/)
  if (mo) return parseInt(mo[1], 10) * 30
  return null
}

/**
 * Parse the search results HTML into job cards. Kill emotion <style> blocks
 * first (they inline CSS selectors that reference the data-at hooks), then
 * split on each job-item element and parse per card by its stable data-at
 * hooks so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const cleaned = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  const results: JobCard[] = []

  const starts: number[] = []
  const re = /<(?:div|article)\b[^>]*data-at="job-item"[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) starts.push(m.index)

  for (let i = 0; i < starts.length; i++) {
    const chunk = cleaned.slice(starts[i], starts[i + 1] ?? cleaned.length)

    const titleA = chunk.match(/<a\b[^>]*data-at="job-item-title"[^>]*>([\s\S]*?)<\/a>/i)
    if (!titleA) continue
    const href = titleA[0].match(/href="([^"]+)"/i)
    if (!href) continue
    const path = decodeHtmlEntities(href[1]).split("?")[0]
    const id = normalizeId(path)
    if (!id) continue
    const title = clean(titleA[1])
    if (!title) continue

    const grab = (name: string): string | null => {
      const f = chunk.match(new RegExp(`data-at="${name}"[^>]*>([\\s\\S]*?)(?=data-at="|$)`, "i"))
      return f ? fieldText(f[1]) || null : null
    }

    results.push({
      id,
      title,
      company: grab("job-item-company-name"),
      location: grab("job-item-location"),
      salary: grab("job-item-salary-info"),
      date: grab("job-item-timeago"),
      url: `${BASE}${path}`,
    })
  }

  return results
}

interface JsonLd {
  "@type"?: string | string[]
  title?: string
  description?: string
  datePosted?: string
  validThrough?: string
  employmentType?: string | string[]
  hiringOrganization?: { name?: string }
  baseSalary?: {
    currency?: string
    value?: { value?: number | string; minValue?: number | string; maxValue?: number | string; unitText?: string }
  }
  jobLocation?:
    | { address?: { addressLocality?: string; addressRegion?: string } }
    | Array<{ address?: { addressLocality?: string; addressRegion?: string } }>
}

function extractJobPostingLd(html: string): JsonLd | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let data: unknown
    try {
      data = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    const items = Array.isArray(data) ? data : [data]
    for (const it of items as JsonLd[]) {
      const t = it["@type"]
      if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return it
    }
  }
  return null
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
}

function formatLdSalary(bs: JsonLd["baseSalary"]): string | null {
  if (!bs) return null
  const cur = bs.currency === "GBP" ? "£" : bs.currency ? `${bs.currency} ` : ""
  const per = bs.value?.unitText ? `/${bs.value.unitText.toLowerCase()}` : ""
  const num = (v: number | string | undefined) =>
    v == null ? null : Number(v).toLocaleString("en-GB")
  const min = num(bs.value?.minValue)
  const max = num(bs.value?.maxValue)
  const val = num(bs.value?.value)
  if (min && max) return `${cur}${min}–${cur}${max}${per}`
  if (val) return `${cur}${val}${per}`
  return null
}

/** Parse a single job's detail page via its JobPosting JSON-LD. */
export function parseJobDetail(html: string, id: string): JobDetail {
  const ld = extractJobPostingLd(html)
  const loc = Array.isArray(ld?.jobLocation) ? ld?.jobLocation[0] : ld?.jobLocation
  const addr = loc?.address
  const location = addr
    ? [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ") || null
    : null
  const empType = Array.isArray(ld?.employmentType)
    ? ld?.employmentType.join(", ")
    : ld?.employmentType ?? null
  const description = ld?.description ? htmlToText(ld.description) || null : null

  return {
    id,
    title: ld?.title ? clean(ld.title) : "(untitled)",
    company: ld?.hiringOrganization?.name ? clean(ld.hiringOrganization.name) : null,
    location,
    salary: formatLdSalary(ld?.baseSalary),
    date: ld?.datePosted ?? null,
    url: `${BASE}/job/${id}`,
    description,
    employmentType: empType,
    validThrough: ld?.validThrough ?? null,
    applyUrl: `${BASE}/job/${id}`,
  }
}
