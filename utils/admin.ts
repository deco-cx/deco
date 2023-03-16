export const adminDomain = `https://deco.cx`;
const adminPreviewUrls = "https://deco-sites-admin-";
const adminPreviewDomain = "deno.dev";

export const isAdmin = (url: string): boolean => {
  if (url.startsWith(adminDomain)) {
    return true;
  }
  const urlObj = new URL(url);
  return (
    url.startsWith(adminPreviewUrls) &&
    urlObj.host.endsWith(adminPreviewDomain) // previews
  );
};

export const adminUrlFor = (pageId: number, siteId: number): string => {
  return `${adminDomain}/admin/${siteId}/pages/${pageId}?sort=asc`;
};
