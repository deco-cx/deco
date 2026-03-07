import { assertEquals, assertThrows } from "@std/assert";
import { parseRepoUrl } from "./repoUrl.ts";

Deno.test("parseRepoUrl: HTTPS with .git suffix", () => {
  const r = parseRepoUrl("https://github.com/deco-cx/deco.git");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseRepoUrl: HTTPS without .git suffix", () => {
  const r = parseRepoUrl("https://github.com/deco-cx/deco");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseRepoUrl: SSH with .git suffix", () => {
  const r = parseRepoUrl("git@github.com:deco-cx/deco.git");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseRepoUrl: SSH without .git suffix", () => {
  const r = parseRepoUrl("git@github.com:deco-cx/deco");
  assertEquals(r, { owner: "deco-cx", repo: "deco" });
});

Deno.test("parseRepoUrl: repo name with dots (foo.bar)", () => {
  const r = parseRepoUrl("git@github.com:org/foo.bar.git");
  assertEquals(r, { owner: "org", repo: "foo.bar" });
});

Deno.test("parseRepoUrl: repo name with dots, no .git suffix", () => {
  const r = parseRepoUrl("https://github.com/org/foo.bar");
  assertEquals(r, { owner: "org", repo: "foo.bar" });
});

Deno.test("parseRepoUrl: repo name with hyphens (foo-bar)", () => {
  const r = parseRepoUrl("git@github.com:org/foo-bar.git");
  assertEquals(r, { owner: "org", repo: "foo-bar" });
});

Deno.test("parseRepoUrl: repo name with dots and hyphens", () => {
  const r = parseRepoUrl("https://github.com/my-org/my.cool-repo.v2.git");
  assertEquals(r, { owner: "my-org", repo: "my.cool-repo.v2" });
});

Deno.test("parseRepoUrl: repo name with underscores", () => {
  const r = parseRepoUrl("git@github.com:org/my_repo.git");
  assertEquals(r, { owner: "org", repo: "my_repo" });
});

Deno.test("parseRepoUrl: rejects non-GitHub URL", () => {
  assertThrows(
    () => parseRepoUrl("https://gitlab.com/org/repo.git"),
    Error,
    "Cannot parse owner/repo",
  );
});

Deno.test("parseRepoUrl: rejects host containing github.com as substring", () => {
  assertThrows(
    () => parseRepoUrl("https://notgithub.com/org/repo.git"),
    Error,
    "Cannot parse owner/repo",
  );
});

Deno.test("parseRepoUrl: multiple dots ending in .git", () => {
  const r = parseRepoUrl("git@github.com:org/a.b.c.git");
  assertEquals(r, { owner: "org", repo: "a.b.c" });
});
