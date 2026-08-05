import { API, jsonFetch, parseDetailRef, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = parseDetailRef(opts.id)
  if (!ref) {
    writeError(
      `Could not parse "<org>/<slug>" from "${opts.id}" (use the id from a search result)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const url = `${API}/organizations/${encodeURIComponent(ref.org)}/jobs/${encodeURIComponent(ref.slug)}`
    const body = await jsonFetch(url)
    const raw = body?.job
    if (!raw) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.contractType ? `Contract: ${job.contractType}` : "",
        job.remote ? `Remote: ${job.remote}` : "",
        job.experienceMin != null ? `Min experience: ${job.experienceMin} yr` : "",
        job.educationLevel ? `Education: ${job.educationLevel}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.date ? `Posted: ${job.date}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
