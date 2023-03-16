export const decoDomain = `https://deco.cx`;
const decoAdminPreviewStart = "https://deco-sites-admin-";
const decoAdminPreviewEnd = "deno.dev";
export const decoPreviewDomainSrc =
  `${decoAdminPreviewStart}*${decoAdminPreviewEnd}`;
export const isDecoAdmin = (url: string): boolean => {
  if (url.startsWith(decoDomain)) {
    return true;
  }
  const urlObj = new URL(url);
  return (
    url.startsWith(decoAdminPreviewStart) &&
    urlObj.host.endsWith(decoAdminPreviewEnd) // previews
  );
};
