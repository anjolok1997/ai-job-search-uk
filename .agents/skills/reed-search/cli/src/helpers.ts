// Data source: reed.co.uk public job pages. No authentication, no API key.
// Search returns an HTML list of job cards (parsed from stable data-qa hooks);
// detail returns a single job's page, which carries a JobPosting JSON-LD block
// we parse for structured fields. Reed's public API is an alternative, but the
// public site works key-free and is what this skill uses.

export const BASE = "https://www.reed.co.uk"
export const SEARCH_URL = `${BASE}/jobs`

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

const GRADUATE_RE =
  /\b(graduate|grad\s*scheme|junior|entry[-\s]?level|trainee|intern(ship)?|apprentice(ship)?|placement|early\s*career)/i

/**
 * Early-career heuristic for the --graduate filter. Reed exposes no experience
 * field, so we match on the job title reading as graduate/junior/entry-level.
 */
export function isGraduateTitle(title: string): boolean {
  return GRADUATE_RE.test(title || "")
}

/** Build a canonical Reed detail URL from a numeric id (any slug works). */
export function detailUrlFromId(id: string): string {
  return `${BASE}/jobs/x/${id}`
}

/** Reed's job id from a URL, path, or bare number. */
export function normalizeId(input: string): string | null {
  const url = input.match(/\/jobs\/[^/]+\/(\d{5,})/) || input.match(/(\d{5,})/)
  return url ? url[1] : null
}

/**
 * Turn Reed's card date label into whole days since posting.
 * Reed labels recent posts relatively ("Today", "Yesterday", "5 days ago",
 * "3 hours ago") and older posts by absolute date ("30 June", "2 May 2026").
 * Returns null when a date cannot be determined.
 */
export function dateToDaysAgo(label: string | null, now: Date = new Date()): number | null {
  if (!label) return null
  const s = label.trim().toLowerCase()
  if (/just now|today|hour|minute|moment/.test(s)) return 0
  if (/yesterday/.test(s)) return 1
  const rel = s.match(/(\d+)\s*day/)
  if (rel) return parseInt(rel[1], 10)
  // Absolute "30 June" or "2 May 2026".
  const abs = s.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/)
  if (abs) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    const mi = months.indexOf(abs[2].slice(0, 3))
    if (mi >= 0) {
      const day = parseInt(abs[1], 10)
      let year = abs[3] ? parseInt(abs[3], 10) : now.getFullYear()
      let posted = new Date(Date.UTC(year, mi, day))
      // No explicit year and the date is in the future → it was last year.
      if (!abs[3] && posted.getTime() > now.getTime()) {
        posted = new Date(Date.UTC(year - 1, mi, day))
      }
      const diff = Math.floor((now.getTime() - posted.getTime()) / 86400000)
      return diff >= 0 ? diff : null
    }
  }
  return null
}

/**
 * Parse the search results HTML into job cards. Split on the job-card article
 * boundary and parse each chunk independently so one malformed card cannot
 * break the rest. Anchored on Reed's stable data-qa hooks.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article[^>]*data-qa="job-card"/i).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/data-id="job(\d+)"/i)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleA = chunk.match(
      /<a[^>]*href="(\/jobs\/[^"]+)"[^>]*data-qa="job-card-title"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!titleA) continue
    const url = BASE + decodeHtmlEntities(titleA[1]).split("?")[0]
    const title = clean(titleA[2])
    if (!title) continue

    // "30 June by <a>Company</a>" or "5 days ago by Company".
    let company: string | null = null
    let date: string | null = null
    const postedBy = chunk.match(/data-qa="job-posted-by"[^>]*>([\s\S]*?)<\/div>/i)
    if (postedBy) {
      const raw = postedBy[1]
      const byLink = raw.match(/by[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
      company = byLink ? clean(byLink[1]) || null : null
      const before = raw.split(/\bby\b/i)[0]
      date = clean(before) || null
      if (!company) {
        const after = clean(raw.replace(/^[\s\S]*?\bby\b/i, ""))
        company = after || null
      }
    }

    const locM = chunk.match(/data-qa="job-metadata-location"[^>]*>([\s\S]*?)<\/li>/i)
    const location = locM ? clean(locM[1]) || null : null
    const salM = chunk.match(/data-qa="job-metadata-salary"[^>]*>([\s\S]*?)<\/li>/i)
    const salary = salM ? clean(salM[1]) || null : null

    results.push({ id, title, company, location, salary, date, url })
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
  hiringOrganization?: { name?: string; sameAs?: string }
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
    salary: null,
    date: ld?.datePosted ?? null,
    url: `${BASE}/jobs/x/${id}`,
    description,
    employmentType: empType,
    validThrough: ld?.validThrough ?? null,
    applyUrl: `${BASE}/jobs/apply/${id}`,
  }
}
