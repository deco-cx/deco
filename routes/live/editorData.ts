// FIXME(mcandeia) temporary compatibility layer

import { generateEditorData } from "$live/compatibility/v0/editorData.ts";

export const handler = async (req: Request) => {
  const url = new URL(req.url);
  const page = url.searchParams.get("pageId");
  if (!page) {
    return new Response(undefined, { status: 404 });
  }

  const editorData = await generateEditorData(url, page);

  return Response.json(editorData, {
    headers: {
      "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, *",
    },
  });
};
