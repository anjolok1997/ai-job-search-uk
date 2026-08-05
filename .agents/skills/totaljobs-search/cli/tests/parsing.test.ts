import { test, expect, describe } from "bun:test"
import {
  parseJobCards,
  parseJobDetail,
  dateToDaysAgo,
  normalizeId,
  detailUrlFromId,
  isGraduateTitle,
  buildSearchUrl,
  slugify,
} from "../src/helpers.js"

// Sample search HTML modelled on Totaljobs' real markup: an inline emotion
// <style> block that references the data-at hooks (must be stripped first),
// then two job-item cards whose text fields sit after an icon <svg>.
const CARD_HTML = `
<style data-emotion="css 1a2b3c">.css-x[data-at="job-item-title"]{color:red}</style>
<div data-genesis-element="BOX" data-at="job-item">
  <a href="/job/data-engineer/london-job107797816?searchId=abc" data-at="job-item-title">Data Engineer</a>
  <div data-at="job-item-company-name"><svg aria-hidden="true"></svg>Claranet Limited</div>
  <div data-at="job-item-location"><svg aria-hidden="true"></svg>London</div>
  <div data-at="job-item-salary-info"><svg aria-hidden="true"></svg>£60,000 - £70,000 per annum</div>
  <div data-at="job-item-timeago">2 days ago</div>
</div>
<div data-genesis-element="BOX" data-at="job-item">
  <a href="/job/graduate-data-analyst/manchester-job107990001" data-at="job-item-title">Graduate Data Analyst</a>
  <div data-at="job-item-company-name"><svg></svg>Acme Ltd</div>
  <div data-at="job-item-location"><svg></svg>Manchester</div>
  <div data-at="job-item-salary-info"><svg></svg>Competitive</div>
  <div data-at="job-item-timeago">Today</div>
</div>`

describe("parseJobCards", () => {
  const cards = parseJobCards(CARD_HTML)

  test("parses every card", () => {
    expect(cards.length).toBe(2)
  })

  test("extracts id, title and absolute url", () => {
    const c = cards[0]
    expect(c.id).toBe("107797816")
    expect(c.title).toBe("Data Engineer")
    expect(c.url).toBe("https://www.totaljobs.com/job/data-engineer/london-job107797816")
  })

  test("extracts company, location, salary and date past the icon svg", () => {
    const c = cards[0]
    expect(c.company).toBe("Claranet Limited")
    expect(c.location).toBe("London")
    expect(c.salary).toContain("60,000")
    expect(c.date).toBe("2 days ago")
  })

  test("parses the second card independently", () => {
    const c = cards[1]
    expect(c.id).toBe("107990001")
    expect(c.title).toBe("Graduate Data Analyst")
    expect(c.company).toBe("Acme Ltd")
    expect(c.location).toBe("Manchester")
    expect(c.date).toBe("Today")
  })

  test("inline <style> CSS is not mistaken for a card", () => {
    const c = cards[0]
    expect(c.title).not.toContain("color")
    expect(c.title).not.toContain("{")
  })

  test("one malformed card does not break the rest", () => {
    const broken = CARD_HTML.replace('data-at="job-item-title">Data Engineer</a>', "")
    const parsed = parseJobCards(broken)
    expect(parsed.length).toBe(1)
    expect(parsed[0].id).toBe("107990001")
  })
})

describe("dateToDaysAgo", () => {
  test("relative labels", () => {
    expect(dateToDaysAgo("Today")).toBe(0)
    expect(dateToDaysAgo("Just now")).toBe(0)
    expect(dateToDaysAgo("4 hours ago")).toBe(0)
    expect(dateToDaysAgo("Yesterday")).toBe(1)
    expect(dateToDaysAgo("1 day ago")).toBe(1)
    expect(dateToDaysAgo("5 days ago")).toBe(5)
    expect(dateToDaysAgo("2 weeks ago")).toBe(14)
    expect(dateToDaysAgo("1 month ago")).toBe(30)
  })
  test("unparseable returns null", () => {
    expect(dateToDaysAgo("whenever")).toBeNull()
    expect(dateToDaysAgo(null)).toBeNull()
  })
})

describe("id helpers", () => {
  test("normalizeId from url, path and bare number", () => {
    expect(normalizeId("https://www.totaljobs.com/job/data-engineer/london-job107797816?x=1")).toBe(
      "107797816",
    )
    expect(normalizeId("/job/107797816")).toBe("107797816")
    expect(normalizeId("107797816")).toBe("107797816")
    expect(normalizeId("not-a-job")).toBeNull()
  })
  test("detailUrlFromId builds a bare-id url", () => {
    expect(detailUrlFromId("107797816")).toBe("https://www.totaljobs.com/job/107797816")
  })
})

describe("url building", () => {
  test("slugify normalises keywords and locations", () => {
    expect(slugify("Data Engineer")).toBe("data-engineer")
    expect(slugify("  C++ / SQL  ")).toBe("c-sql")
  })
  test("buildSearchUrl uses path form with in-<location>", () => {
    expect(buildSearchUrl("data engineer", "London", 1)).toBe(
      "https://www.totaljobs.com/jobs/data-engineer/in-london",
    )
    expect(buildSearchUrl("data", "Manchester", 2)).toBe(
      "https://www.totaljobs.com/jobs/data/in-manchester?page=2",
    )
    expect(buildSearchUrl(undefined, "UK", 1)).toBe("https://www.totaljobs.com/jobs/jobs/in-uk")
  })
})

describe("isGraduateTitle", () => {
  test("matches early-career titles", () => {
    expect(isGraduateTitle("Graduate Data Analyst")).toBe(true)
    expect(isGraduateTitle("Junior Software Engineer")).toBe(true)
    expect(isGraduateTitle("Entry Level Paralegal")).toBe(true)
    expect(isGraduateTitle("Management Trainee")).toBe(true)
    expect(isGraduateTitle("Software Engineering Intern")).toBe(true)
    expect(isGraduateTitle("Apprentice Electrician")).toBe(true)
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
  {"@context":"https://schema.org","@type":"WebSite","name":"Totaljobs"}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"JobPosting","title":"Data Engineer",
   "description":"<p><strong>Role</strong></p><ul><li>Build pipelines</li><li>Own data</li></ul>",
   "datePosted":"2026-06-30T07:28:40.920Z","validThrough":"2026-08-11T23:59:59.000Z",
   "employmentType":"FULL_TIME",
   "hiringOrganization":{"@type":"Organization","name":"Claranet Limited"},
   "baseSalary":{"@type":"MonetaryAmount","currency":"GBP","value":{"@type":"QuantitativeValue","minValue":60000,"maxValue":70000,"unitText":"YEAR"}},
   "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"London","addressRegion":"Greater London"}}}
  </script></head><body></body></html>`

  const job = parseJobDetail(DETAIL_HTML, "107797816")

  test("selects the JobPosting node among multiple ld+json blocks", () => {
    expect(job.title).toBe("Data Engineer")
    expect(job.company).toBe("Claranet Limited")
    expect(job.location).toBe("London, Greater London")
    expect(job.employmentType).toBe("FULL_TIME")
    expect(job.date).toBe("2026-06-30T07:28:40.920Z")
    expect(job.validThrough).toBe("2026-08-11T23:59:59.000Z")
  })

  test("formats a GBP salary range", () => {
    expect(job.salary).toBe("£60,000–£70,000/year")
  })

  test("description is stripped to readable text", () => {
    expect(job.description).toContain("Role")
    expect(job.description).toContain("Build pipelines")
    expect(job.description).not.toContain("<li>")
  })
})
