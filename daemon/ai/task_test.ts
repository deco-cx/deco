import { assertEquals, assertThrows } from "@std/assert";

/**
 * The regex used in getRepoInfo to extract owner/repo from a git remote URL.
 * Kept in sync with the pattern in task.ts.
 */
const REPO_URL_RE = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/;

function parseOwnerRepo(
  url: string,
): { owner: string; repo: string } {
  const match = url.match(REPO_URL_RE);
  if (!match) {
    throw new Error(`Cannot parse owner/repo from git remote: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

Deno.test("parseOwnerRepo: HTTPS with .git suffix", () => {
  const r = parseOwnerRepo("https://github.com/deco-cx/deco.git");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseOwnerRepo: HTTPS without .git suffix", () => {
  const r = parseOwnerRepo("https://github.com/deco-cx/deco");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseOwnerRepo: SSH with .git suffix", () => {
  const r = parseOwnerRepo("git@github.com:deco-cx/deco.git");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseOwnerRepo: SSH without .git suffix", () => {
  const r = parseOwnerRepo("git@github.com:deco-cx/deco");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseOwnerRepo: repo name with dots (foo.bar)", () => {
  const r = parseOwnerRepo("git@github.com:org/foo.bar.git");
  assertEquals(r, { owner: "org", repo: "foo.bar" });
});

Deno.test("parseOwnerRepo: repo name with dots, no .git suffix", () => {
  const r = parseOwnerRepo("https://github.com/org/foo.bar");
  assertEquals(r, { owner: "org", repo: "foo.bar" });
});

Deno.test("parseOwnerRepo: repo name with hyphens (foo-bar)", () => {
  const r = parseOwnerRepo("git@github.com:org/foo-bar.git");
  assertEquals(r, { owner: "org", repo: "foo-bar" });
});

Deno.test("parseOwnerRepo: repo name with dots and hyphens", () => {
  const r = parseOwnerRepo("https://github.com/my-org/my.cool-repo.v2.git");
  assertEquals(r, { owner: "my-org", repo: "my.cool-repo.v2" });
});

Deno.test("parseOwnerRepo: repo name with underscores", () => {
  const r = parseOwnerRepo("git@github.com:org/my_repo.git");
  assertEquals(r, { owner: "org", repo: "my_repo" });
});

Deno.test("parseOwnerRepo: rejects non-GitHub URL", () => {
  assertThrows(
    () => parseOwnerRepo("https://gitlab.com/org/repo.git"),
    Error,
    "Cannot parse owner/repo",
  );
});

Deno.test("parseOwnerRepo: multiple dots ending in .git", () => {
  const r = parseOwnerRepo("git@github.com:org/a.b.c.git");
  assertEquals(r, { owner: "org", repo: "a.b.c" });
});
