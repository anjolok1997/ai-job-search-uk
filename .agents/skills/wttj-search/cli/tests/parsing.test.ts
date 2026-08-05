import { test, expect, describe } from "bun:test"
import {
  mapCard,
  isGB,
  isGraduate,
  parseDetailRef,
  parseJobDetail,
  htmlToText,
} from "../src/helpers.js"

const RAW_JOB = {
  name: "Data Engineer",
  slug: "data-engineer_london_ABC123",
  contract_type: "full_time",
  remote: "partial",
  published_at: "2026-07-31T04:00:46Z",
  experience_min: 3,
  salary_min: 60000,
  salary_max: 80000,
  salary_currency: "GBP",
  salary_period: "yearly",
  organization: { name: "Acme Data", slug: "acme-data" },
  office: { city: "London", country_code: "GB" },
  offices: [{ city: "London", country_code: "GB" }],
}

describe("mapCard", () => {
  const c = mapCard(RAW_JOB)
  test("builds an org/slug id and public url", () => {
    expect(c.id).toBe("acme-data/data-engineer_london_ABC123")
    expect(c.url).toBe(
      "https://www.welcometothejungle.com/en/companies/acme-data/jobs/data-engineer_london_ABC123",
    )
  })
  test("maps title, company, location, date", () => {
    expect(c.title).toBe("Data Engineer")
    expect(c.company).toBe("Acme Data")
    expect(c.location).toBe("London, GB")
    expect(c.date).toBe("2026-07-31T04:00:46Z")
  })
  test("formats a salary range", () => {
    expect(c.salary).toContain("60,000")
    expect(c.salary).toContain("80,000")
    expect(c.salary).toContain("GBP")
  })
  test("carries fields the graduate filter needs", () => {
    expect(c.contractType).toBe("full_time")
    expect(c.experienceMin).toBe(3)
  })
})

describe("isGB", () => {
  test("true when an office is GB", () => {
    expect(isGB(RAW_JOB)).toBe(true)
  })
  test("false when all offices are non-GB", () => {
    expect(isGB({ office: { city: "Paris", country_code: "FR" }, offices: [] })).toBe(false)
  })
  test("reads the offices array when office is absent", () => {
    expect(isGB({ offices: [{ country_code: "FR" }, { country_code: "GB" }] })).toBe(true)
  })
})

describe("isGraduate", () => {
  test("title keyword qualifies", () => {
    expect(isGraduate(mapCard({ ...RAW_JOB, name: "Graduate Software Engineer" }))).toBe(true)
    expect(isGraduate(mapCard({ ...RAW_JOB, name: "Junior Analyst" }))).toBe(true)
    expect(isGraduate(mapCard({ ...RAW_JOB, name: "Data Engineer Intern" }))).toBe(true)
  })
  test("internship / apprenticeship contract qualifies", () => {
    expect(isGraduate(mapCard({ ...RAW_JOB, contract_type: "internship" }))).toBe(true)
    expect(isGraduate(mapCard({ ...RAW_JOB, contract_type: "apprenticeship" }))).toBe(true)
  })
  test("low required experience qualifies", () => {
    expect(isGraduate(mapCard({ ...RAW_JOB, experience_min: 0 }))).toBe(true)
    expect(isGraduate(mapCard({ ...RAW_JOB, experience_min: 1 }))).toBe(true)
  })
  test("a senior role with 3+ years does not qualify", () => {
    expect(isGraduate(mapCard(RAW_JOB))).toBe(false)
    expect(isGraduate(mapCard({ ...RAW_JOB, name: "Senior Data Engineer" }))).toBe(false)
  })
})

describe("parseDetailRef", () => {
  test("plain org/slug", () => {
    expect(parseDetailRef("acme-data/data-engineer_london_ABC123")).toEqual({
      org: "acme-data",
      slug: "data-engineer_london_ABC123",
    })
  })
  test("api url", () => {
    expect(
      parseDetailRef("https://api.welcometothejungle.com/api/v3/organizations/ntt-ltd/jobs/x_y_Z"),
    ).toEqual({ org: "ntt-ltd", slug: "x_y_Z" })
  })
  test("public site url", () => {
    expect(
      parseDetailRef("https://www.welcometothejungle.com/en/companies/acme/jobs/some-slug?ref=1"),
    ).toEqual({ org: "acme", slug: "some-slug" })
  })
  test("unparseable returns null", () => {
    expect(parseDetailRef("just-one-token")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  const job = parseJobDetail({
    ...RAW_JOB,
    description: "<p><strong>Role</strong></p><ul><li>Build pipelines</li><li>Own data</li></ul>",
    education_level: "bachelor",
    apply_url: "https://example.com/apply",
  })
  test("strips description html to readable text", () => {
    expect(job.description).toContain("Role")
    expect(job.description).toContain("Build pipelines")
    expect(job.description).not.toContain("<li>")
  })
  test("maps education level and apply url", () => {
    expect(job.educationLevel).toBe("bachelor")
    expect(job.applyUrl).toBe("https://example.com/apply")
  })
})

describe("htmlToText", () => {
  test("collapses whitespace and decodes entities", () => {
    expect(htmlToText("<p>a&amp;b</p><p>c</p>")).toBe("a&b\nc")
  })
})
