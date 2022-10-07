import { Handlers, PageProps } from "$fresh/server.ts";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import { getSupabaseClientForUser } from "$live/supabase.ts";
import { createPrivateHandler } from "$live/auth.tsx";
import LiveContext from "./context.ts";

const PageRow = (props: { page: any }) => {
  const { page } = props;
  return (
    <tr class="hover:bg-primary-light">
      <td class="border-b border-primary-light p-4 pl-8 text-primary-dark">
        {page.id}
      </td>
      <td class="border-b border-primary-light text-primary-dark">
        <a
          href={`${page.path}?editor`}
          target="_blank"
          class="w-full h-full block p-4 pl-8"
        >
          {page.path}
        </a>
      </td>
      <td class="border-b border-primary-light p-4 pl-8 text-primary-dark">
        {page.name}
      </td>
      <td class="border-b border-primary-light p-4 pl-8 text-primary-dark">
        {page.created_at}
      </td>
    </tr>
  );
};

export default function LiveAdmin(props: PageProps<any>) {
  const { data: { pages, site } } = props;
  return (
    <div class="bg-white min-h-screen border-l-2 p-2">
      <div class="mb-5">
        <p>
          Welcome to <strong>{site}</strong>.
        </p>
      </div>

      <h2 class="mb-2 text-xl font-bold">My pages</h2>
      <table class="border-collapse table-fixed w-full text-sm text-primary-dark">
        <thead>
          <tr>
            <th class="border-b border-primary-light font-medium p-4 pl-8 pt-0 pb-3 text-left w-4">
              id
            </th>
            <th class="border-b border-primary-light font-medium p-4 pl-8 pt-0 pb-3 text-left w-1/4">
              path
            </th>
            <th class="border-b border-primary-light font-medium p-4 pl-8 pt-0 pb-3 text-left">
              name
            </th>
            <th class="border-b border-primary-light font-medium p-4 pl-8 pt-0 pb-3 text-left">
              created
            </th>
          </tr>
        </thead>
        <tbody class="bg-white">
          {pages.map((page: any) => <PageRow page={page} />)}
        </tbody>
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
    const res = await ctx.render({ pages: Pages, site });
    end("render");

    res.headers.set("Server-Timing", printTimings());
    return res;
  }),
};
