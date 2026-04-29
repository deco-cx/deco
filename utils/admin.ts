import type { JSONSchema7 } from "../deps.ts";

const extraAdminDomains = typeof Deno !== "undefined"
  ? (Deno.env.get("ADMIN_DOMAINS")
    ?.split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .flatMap((d) => {
      try {
        return [new URL(d).origin];
      } catch {
        console.warn(`[admin] Skipping invalid ADMIN_DOMAINS entry: "${d}"`);
        return [];
      }
    }) ?? [])
  : [];

export const adminDomains = [
  "https://admin.deco.cx",
  "https://admin-cx.deco.page",
  "https://deco.chat",
  "https://admin.decocms.com",
  "https://decocms.com",
  "https://studio.decocms.com",
  ...extraAdminDomains,
];
export const landingPageDomain = ["https://deco.cx", "https://www.deco.cx"];

export const isAdmin = (url: string): boolean => {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (adminDomains.includes(urlObj.origin)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const isAdminOrLocalhost = (req: Request): boolean => {
  const referer = req.headers.get("origin") ?? req.headers.get("referer");
  const isOnAdmin = referer && isAdmin(referer);
  const url = new URL(req.url);
  const isLocalhost = ["localhost", "127.0.0.1"].includes(url.hostname);
  return isOnAdmin || isLocalhost;
};

export const adminUrlFor = (
  pageId: string | number,
  siteId: number,
): string => {
  return `${adminDomains[0]}/admin/${siteId}/pages/${pageId}?sort=asc`;
};

export const resolvable = (ref: string, id: string): JSONSchema7 => {
  return {
    title: `#${ref}@${id}`,
    type: "object",
    required: ["__resolveType"],
    properties: {
      __resolveType: {
        type: "string",
        enum: [id],
        default: id,
      },
    },
  };
};
