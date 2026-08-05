import { test, expect, describe } from "bun:test"
import { runCLI } from "./helpers.js"

describe("cli flag validation", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("totaljobs-cli")
  })

  test("--help prints help and exits 0", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("USAGE")
  })

  test("unknown command errors on stderr with exit 1", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("BAD_CMD")
  })

  test("detail without an id errors on stderr with exit 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("NO_ID")
  })

  test("detail with an unparseable id errors on stderr with exit 1", async () => {
    const r = await runCLI(["detail", "not-a-job"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("BAD_ID")
  })

  test("non-numeric --jobage errors on stderr with exit 1", async () => {
    const r = await runCLI(["search", "-q", "x", "--jobage", "soon"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("BAD_ARG")
  })
})
