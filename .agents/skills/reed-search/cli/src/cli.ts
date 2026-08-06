#!/usr/bin/env bun
// Self-contained CLI for searching jobs on reed.co.uk's public job pages.
// UK-focused: when --location is omitted it searches the default cities in
// config/uk-cities.json. No authentication, no API key, zero runtime deps.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      // A dash-led token is another flag, EXCEPT a negative number, which we
      // capture as this flag's value so the numeric guard can reject it with
      // the actual bad value rather than silently dropping the filter.
      if (next === undefined || (next.startsWith("-") && !/^-\d/.test(next))) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `reed-cli — search jobs on reed.co.uk (UK)

USAGE
  bun run src/cli.ts search [--query "<text>"] [--location "<place>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role). Recommended.
  --location, -l <text>   UK location, e.g. "London", "Manchester", "Remote".
                          Omit to search the default cities in config/uk-cities.json.
  --jobage <days>         Keep only jobs posted within N days (client-side). Default: all.
  --fulltime              Full-time roles only.
  --permanent             Permanent contracts only.
  --graduate              Early-careers only: keep graduate/junior/entry-level/
                          trainee/intern/apprentice titles. Works with no --query.
  --page <n>              1-indexed page (25 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "data engineer" --format table
  bun run src/cli.ts search -q "product manager" -l "Manchester" --jobage 14 --format table
  bun run src/cli.ts search -q "paralegal" -l "Remote" --permanent
  bun run src/cli.ts detail 57070632 --format plain

Uses reed.co.uk public pages. Keep volume low.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    // Numeric filter flags must be non-negative whole numbers. A bare
    // parseInt() truncated "2.5" to 2 and accepted "-5" (parseFlags swallows a
    // dash-led value as a valueless flag), so a fractional silently rounded and
    // a negative silently disabled the filter. Reject both.
    for (const key of ["jobage", "page", "limit"]) {
      const raw = flags[key]
      if (raw === undefined) continue
      if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
        const shown = raw === true ? "(missing value)" : String(raw)
        process.stderr.write(
          JSON.stringify({
            error: `--${key} must be a non-negative whole number, got "${shown}"`,
            code: "BAD_ARG",
          }) + "\n",
        )
        return 1
      }
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: typeof flags.jobage === "string" ? parseInt(flags.jobage, 10) : 9999,
      fullTime: flags.fulltime === true || flags.fullTime === true,
      permanent: flags.permanent === true,
      graduate: flags.graduate === true,
      page: typeof flags.page === "string" ? Math.max(1, parseInt(flags.page, 10)) : 1,
      limit: typeof flags.limit === "string" ? parseInt(flags.limit, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
