import { test, expect, describe } from "bun:test"
import {
  parseJobCards,
  parseJobDetail,
  dateToDaysAgo,
  normalizeId,
  detailUrlFromId,
  isGraduateTitle,
} from "../src/helpers.js"

const CARD_HTML = `
<div class="results">
<article class="card index-module_jobCard" data-qa="job-card" data-id="job57070632">
  <h2><a href="/jobs/data-engineer/57070632?source=searchResults&amp;filter=x" data-qa="job-card-title">Data Engineer</a></h2>
  <div data-qa="job-posted-by" class="posted">30 June<!-- --> by <a href="/jobs/claranet-limited/p33417" data-element="recruiter">Claranet Limited</a></div>
  <ul>
    <li data-qa="job-metadata-salary" class="item"><svg aria-label="Salary"></svg>Salary negotiable</li>
    <li data-qa="job-metadata-location" class="item"><svg aria-label="Location"></svg>London</li>
  </ul>
</article>
<article class="card" data-qa="job-card" data-id="job57160960">
  <h2><a href="/jobs/senior-data-engineer/57160960" data-qa="job-card-title">Senior Data Engineer</a></h2>
  <div data-qa="job-posted-by">5 days ago by <a href="/jobs/acme/p1">Acme Ltd</a></div>
  <ul>
    <li data-qa="job-metadata-salary"><svg></svg>£70,000 - £80,000 per annum</li>
    <li data-qa="job-metadata-location"><svg></svg>Manchester</li>
  </ul>
</article>
</div>`

describe("parseJobCards", () => {
  const cards = parseJobCards(CARD_HTML)

  test("parses every card", () => {
    expect(cards.length).toBe(2)
  })

  test("extracts id, title and absolute url", () => {
    const c = cards[0]
    expect(c.id).toBe("57070632")
    expect(c.title).toBe("Data Engineer")
    expect(c.url).toBe("https://www.reed.co.uk/jobs/data-engineer/57070632")
  })

  test("extracts company, location, salary and date", () => {
    const c = cards[0]
    expect(c.company).toBe("Claranet Limited")
    expect(c.location).toBe("London")
    expect(c.salary).toBe("Salary negotiable")
    expect(c.date).toBe("30 June")
  })

  test("handles relative dates and salary ranges", () => {
    const c = cards[1]
    expect(c.company).toBe("Acme Ltd")
    expect(c.location).toBe("Manchester")
    expect(c.date).toBe("5 days ago")
    expect(c.salary).toContain("70,000")
  })

  test("one malformed card does not break the rest", () => {
    const broken = CARD_HTML.replace('data-qa="job-card-title">Data Engineer</a>', "")
    const parsed = parseJobCards(broken)
    expect(parsed.length).toBe(1)
    expect(parsed[0].id).toBe("57160960")
  })
})

describe("dateToDaysAgo", () => {
  const now = new Date("2026-08-04T12:00:00Z")
  test("relative labels", () => {
    expect(dateToDaysAgo("Today", now)).toBe(0)
    expect(dateToDaysAgo("Just now", now)).toBe(0)
    expect(dateToDaysAgo("Yesterday", now)).toBe(1)
    expect(dateToDaysAgo("5 days ago", now)).toBe(5)
    expect(dateToDaysAgo("3 hours ago", now)).toBe(0)
  })
  test("absolute date without year infers current year", () => {
    expect(dateToDaysAgo("30 June", now)).toBe(35)
  })
  test("future month without year rolls back a year", () => {
    expect(dateToDaysAgo("30 December", now)).toBeGreaterThan(200)
  })
  test("unparseable returns null", () => {
    expect(dateToDaysAgo("whenever", now)).toBeNull()
    expect(dateToDaysAgo(null, now)).toBeNull()
  })
})

describe("id helpers", () => {
  test("normalizeId from url, path and bare number", () => {
    expect(normalizeId("https://www.reed.co.uk/jobs/data-engineer/57070632?x=1")).toBe("57070632")
    expect(normalizeId("/jobs/x/57070632")).toBe("57070632")
    expect(normalizeId("57070632")).toBe("57070632")
    expect(normalizeId("not-a-job")).toBeNull()
  })
  test("detailUrlFromId builds a fetchable slug url", () => {
    expect(detailUrlFromId("57070632")).toBe("https://www.reed.co.uk/jobs/x/57070632")
  })
})

describe("isGraduateTitle", () => {
  test("matches early-career titles", () => {
    expect(isGraduateTitle("Graduate Data Analyst")).toBe(true)
    expect(isGraduateTitle("Junior Software Engineer")).toBe(true)
    expect(isGraduateTitle("Entry Level Paralegal")).toBe(true)
    expect(isGraduateTitle("Management Trainee")).toBe(true)
    expect(isGraduateTitle("Software Engineering Intern")).toBe(true)
  })
  test("does not match senior/plain titles", () => {
    expect(isGraduateTitle("Senior Data Engineer")).toBe(false)
    expect(isGraduateTitle("Product Manager")).toBe(false)
    expect(isGraduateTitle("")).toBe(false)
  })
})

describe("parseJobDetail", () => {
  const DETAIL_HTML = `<html><head>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"JobPosting","title":"Data Engineer",
   "description":"<p><strong>Role</strong></p><ul><li>Build pipelines</li><li>Own data</li></ul>",
   "datePosted":"2026-06-30T07:28:40.920Z","validThrough":"2026-08-11T23:59:59.000Z",
   "employmentType":"FULL_TIME",
   "hiringOrganization":{"@type":"Organization","name":"Claranet Limited","sameAs":"https://www.reed.co.uk/company-profile/Claranet-Limited"},
   "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"London","addressRegion":"South East England"}}}
  </script></head><body></body></html>`

  const job = parseJobDetail(DETAIL_HTML, "57070632")

  test("maps JSON-LD fields", () => {
    expect(job.title).toBe("Data Engineer")
    expect(job.company).toBe("Claranet Limited")
    expect(job.location).toBe("London, South East England")
    expect(job.employmentType).toBe("FULL_TIME")
    expect(job.date).toBe("2026-06-30T07:28:40.920Z")
    expect(job.validThrough).toBe("2026-08-11T23:59:59.000Z")
  })

  test("description is stripped to readable text", () => {
    expect(job.description).toContain("Role")
    expect(job.description).toContain("Build pipelines")
    expect(job.description).not.toContain("<li>")
  })
})
