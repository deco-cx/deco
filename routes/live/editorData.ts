import { generateEditorData } from "../../compatibility/v0/editorData.ts";
import { allowCorsFor } from "../../utils/http.ts";

export const handler = async (req: Request) => {
  const url = new URL(req.url);
  // FIXME (mcandeia) compatibility only.
  return Response.json(
    await generateEditorData(
      url,
    ),
    {
      headers: allowCorsFor(req),
    },
  );
};
