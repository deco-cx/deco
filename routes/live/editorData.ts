import { generateEditorData } from "$live/compatibility/v0/editorData.ts";

export const handler = async (req: Request) => {
  const url = new URL(req.url);
  // FIXME (mcandeia) compatibility only.
  return Response.json(
    await generateEditorData(
      url,
    ),
    {
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, *",
      },
    },
  );
};
