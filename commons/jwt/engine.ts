import type { JwtPayload } from "./jwt.ts";

const matchPart = (urnPart: string, otherUrnPart: string) =>
  urnPart === "*" || otherUrnPart === urnPart;
const matchParts = (urn: string[], resource: string[]) => {
  return urn.every((part, idx) => matchPart(part, resource[idx]));
};
const matches = (urnParts: string[]) => (resourceUrn: string) => {
  const resourceParts = resourceUrn
    .split(":");
  const lastIdx = resourceParts.length - 1;
  return resourceParts.every((part, idx) => {
    if (part === "*") {
      return true;
    }
    if (lastIdx === idx) {
      return matchParts(part.split("/"), urnParts[idx].split("/"));
    }
    return part === urnParts[idx];
  });
};

const siteUrn = (site: string) => `urn:deco:site:*:${site}:deployment/*`;

export const tokenIsValid = (site: string, jwt: JwtPayload): boolean => {
  const { iss, sub, exp } = jwt;
  console.log({ iss, sub, exp });
  if (!iss || !sub) {
    return false;
  }
  if (exp && new Date(exp) <= new Date()) {
    return false;
  }
  const matchWithSite = matches(sub.split(":"));
  return matchWithSite(siteUrn(site));
};
