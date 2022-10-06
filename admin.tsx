import { Handlers, PageProps } from "$fresh/server.ts";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import { getSupabaseClientForUser } from "$live/supabase.ts";
import { createPrivateHandler } from "$live/auth.tsx";
import LiveContext from "./context.ts";

const PageRow = (props: { page: any }) => {
  const { page } = props;
  return (
    <tr>
      <td>{page.id}</td>
      <td>{page.path}</td>
      <td>{page.name}</td>
      <td>{page.created_at}</td>
    </tr>
  );
};

export default function LiveAdmin(props: PageProps<any>) {
  const { data } = props;
  return (
    <div class="bg-white min-h-screen border-l-2 p-2">
      Admin...
      <table>
        <tr>
          <th>id</th>
          <th>path</th>
          <th>name</th>
          <th>created</th>
        </tr>
        {data.map((page: any) => <PageRow page={page} />)}
      </table>
    </div>
  );
}

export const adminHandler: Handlers<any> = {
  GET: createPrivateHandler(async (req, ctx) => {
    const { start, end, printTimings } = createServerTiming();
    const { site } = LiveContext.getLiveOptions();

    start("fetch");
    const { data: Pages, error } = await getSupabaseClientForUser(req)
      .from("pages")
      .select(
        "id, created_at, path, public, name, site!inner(name, id), archived, flag",
      )
      .eq("site.name", site);

    end("fetch");

    start("render");
    const res = await ctx.render(Pages);
    end("render");

    res.headers.set("Server-Timing", printTimings());
    return res;
  }),
};
