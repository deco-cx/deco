import { HandlerContext, PageProps } from "$fresh/server.ts";
import { DecoState } from "../../mod.ts";

export const handler = async (
  _req: Request,
  ctx: HandlerContext<unknown, DecoState>,
) => {
  const viewer = new URL(_req.url).searchParams.has("viewer");
  const release = await ctx.state.release.state();

  console.log("viewer", viewer);
  if (viewer) {
    return ctx.render({ release });
  }

  return new Response(
    JSON.stringify(release),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};

function ReleaseViewer({
  data: {
    release,
  },
}: PageProps<{ release: any }>) {
  if (!release) {
    throw new Error("Release not found");
  }

  return (
    <div>
      <div>
        <h1>Release</h1>
        <span>number of keys: {Object.keys(release).length}</span>
      </div>
      <div>
        keys: {Object.keys(release).map((a) => <p>{a}</p>)}
      </div>
      <div>
        <span>Raw JSON:</span>
        <pre>{JSON.stringify(release, null, 2)}</pre>
      </div>
    </div>
  );
}

export default ReleaseViewer;
