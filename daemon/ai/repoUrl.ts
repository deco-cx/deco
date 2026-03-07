/** Parse owner/repo from a GitHub remote URL (HTTPS or SSH). */
export function parseRepoUrl(
  url: string,
): { owner: string; repo: string } {
  const match = url.match(
    /(?:\/\/|@)github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  if (!match) {
    throw new Error(`Cannot parse owner/repo from git remote: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}
