import { afterEach, describe, expect, test } from "bun:test";
import { runSearch, loadDefaultLocations } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function searchCard(id: string, title: string): string {
  return `<li>
    <div data-entity-urn="urn:li:jobPosting:${id}">
      <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/${id}"></a>
      <h3 class="base-search-card__title">${title}</h3>
    </div>
  </li>`;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => new Response(searchCard("123456", "Engineer"))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({
      location: "Copenhagen, Denmark",
      jobage: 9999,
      page: 1,
      limit: 0,
      format: "json",
    });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(0);
  });

  test("omitting location searches the UK default cities and de-dupes", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      // Same job id from every city → de-dup should collapse to one.
      return new Response(searchCard("999", "Engineer"));
    }) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ jobage: 9999, page: 1, format: "json" });
    const defaults = loadDefaultLocations();

    expect(code).toBe(0);
    expect(urls).toHaveLength(defaults.length);
    const out = JSON.parse(stdout);
    expect(out.meta.locations).toEqual(defaults.map((d) => d.location));
    expect(out.results).toHaveLength(1);
  });
});

describe("loadDefaultLocations", () => {
  test("maps config/uk-cities.json defaults to LinkedIn place strings", () => {
    const targets = loadDefaultLocations();
    expect(targets.length).toBeGreaterThan(0);
    const locations = targets.map((t) => t.location);
    expect(locations).toContain("London, England, United Kingdom");
    // The remote default becomes a UK-wide search with the remote filter.
    const remote = targets.find((t) => t.remote === "remote");
    expect(remote?.location).toBe("United Kingdom");
  });
});
