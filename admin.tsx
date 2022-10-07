import { Handlers, PageProps } from "$fresh/server.ts";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import { getSupabaseClientForUser } from "$live/supabase.ts";
import { createPrivateHandler } from "$live/auth.tsx";
import LiveContext from "./context.ts";

const LiveBadge = () => (
  <div class="flex items-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill="#003232"
      viewBox="0 0 256 256"
      class="mr-1"
    >
      <rect width="256" height="256" fill="none"></rect>
      <circle
        cx="128"
        cy="128"
        r="96"
        fill="none"
        stroke="#003232"
        stroke-miterlimit="10"
        stroke-width="16"
      >
      </circle>
      <line
        x1="32"
        y1="128"
        x2="224"
        y2="128"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
      <ellipse
        cx="128"
        cy="128"
        rx="40"
        ry="93.4"
        fill="none"
        stroke="#003232"
        stroke-miterlimit="10"
        stroke-width="16"
      >
      </ellipse>
    </svg>
    <span>
      Live
    </span>
  </div>
);

const DraftBadge = () => (
  <div class="flex items-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill="#003232"
      class="mr-1"
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" fill="none"></rect>
      <path
        d="M72,224H56a8,8,0,0,1-8-8V184"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <polyline
        points="120 32 152 32 208 88 208 136"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </polyline>
      <path
        d="M48,64V40a8,8,0,0,1,8-8H80"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <polyline
        points="152 32 152 88 208 88"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </polyline>
      <path
        d="M208,176v40a8,8,0,0,1-8,8h-8"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <line
        x1="48"
        y1="104"
        x2="48"
        y2="144"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
      <line
        x1="112"
        y1="224"
        x2="152"
        y2="224"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
    </svg>
    <span>
      Draft
    </span>
  </div>
);

const ExperimentBadge = () => (
  <div class="flex items-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill="#003232"
      class="mr-1"
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" fill="none"></rect>
      <path
        d="M104,32V93.8a8.4,8.4,0,0,1-1.1,4.1l-63.6,106A8,8,0,0,0,46.1,216H209.9a8,8,0,0,0,6.8-12.1l-63.6-106a8.4,8.4,0,0,1-1.1-4.1V32"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <line
        x1="88"
        y1="32"
        x2="168"
        y2="32"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
      <path
        d="M62.6,165c11.8-8.7,32.1-13.6,65.4,3,35.7,17.9,56.5,10.8,67.9,1.1"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
    </svg>
    <span>
      Experiment
    </span>
  </div>
);

const ArchivedBadge = () => (
  <div class="flex items-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      class="mr-1"
      fill="#003232"
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" fill="none"></rect>
      <rect
        x="24"
        y="56"
        width="208"
        height="40"
        rx="8"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </rect>
      <path
        d="M216,96v96a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V96"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <line
        x1="104"
        y1="136"
        x2="152"
        y2="136"
        fill="none"
        stroke="#003232"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
    </svg>
    <span>
      Archived
    </span>
  </div>
);

const PageRow = (props: { page: any }) => {
  const { page } = props;
  const pageLink = `${page.path}?editor&variantId=${page.id}`;
  const date = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  };
  return (
    <tr class="hover:bg-primary-light">
      <td class="border-b border-primary-light p-4 pl-8 text-primary-dark">
        {page.id}
      </td>
      <td class="border-b border-primary-light text-primary-dark">
        <a
          href={pageLink}
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
        {page.archived
          ? <ArchivedBadge />
          : page.flag
          ? page.flag.traffic === 0 ? <DraftBadge /> : <ExperimentBadge />
          : <LiveBadge />}
      </td>
      <td class="border-b border-primary-light p-4 pl-8 text-primary-dark">
        {page.flag?.traffic}
      </td>
      <td class="border-b border-primary-light p-4 pl-8 text-primary-dark">
        {new Date(page.created_at).toLocaleDateString("pt-BR", date)}
      </td>
    </tr>
  );
};

export default function LiveAdmin(props: PageProps<any>) {
  const { data: { pages, site } } = props;
  const sortedPages = pages.sort((a, b) => a.path.localeCompare(b.path));
  return (
    <div class="bg-white min-h-screen border-l-2 p-2">
      <div class="mb-5">
        <p>
          Welcome to <strong>{site}</strong>.
        </p>
      </div>

      <h2 class="mb-2 font-bold">Pages</h2>
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
              status
            </th>
            <th class="border-b border-primary-light font-medium p-4 pl-8 pt-0 pb-3 text-left ">
              traffic
            </th>
            <th class="border-b border-primary-light font-medium p-4 pl-8 pt-0 pb-3 text-left">
              created
            </th>
          </tr>
        </thead>
        <tbody class="bg-white">
          {sortedPages.map((page: any) => <PageRow page={page} />)}
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
        "id, created_at, path, public, name, site!inner(name, id), archived, flag(traffic, id)",
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
