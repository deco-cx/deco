import { HandlerContext, PageProps } from "$fresh/server.ts";
import { DecoState } from "../../mod.ts";
import { groupObjectBy } from "deco/utils/fn/groupObjectBy.ts";

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

  const grouped = groupObjectBy(release, (key, value) => {
    if (value?.__resolveType?.contains("/sections/")) {
      return "section";
    }
    if (value?.__resolveType?.contains("/loaders/")) {
      return "loader";
    }
    return "other";
  });

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
        <span>Grouped JSON:</span>
        <pre>{JSON.stringify(grouped, null, 2)}</pre>
      </div>
      <div>
        <span>Raw JSON:</span>
        <pre>{JSON.stringify(release, null, 2)}</pre>
      </div>
    </div>
  );
}

export default ReleaseViewer;
