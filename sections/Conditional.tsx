import { Matcher } from "$live/blocks/matcher.ts";
import { Section, SectionProps } from "$live/blocks/section.ts";
import { PreactComponent } from "$live/engine/block.ts";
import { LoaderContext } from "$live/mod.ts";

/**
 * @description Renders a section based on the specified condition.
 * @title Conditional Section.
 */
export default function Conditional({ section }: SectionProps<typeof loader>) {
  return section && <section.Component {...section.props} />;
}

export interface ResolvedSection {
  data: Section;
  /**
   * @default resolved
   */
  __resolveType: "resolved";
}
export interface Props {
  matcher: Matcher;
  section: { data: Section; __resolveType: "resolved" };
}

export const loader = async (
  { matcher, section }: Props,
  req: Request,
  { get }: LoaderContext,
) => {
  if (matcher && typeof matcher === "function" && matcher({ request: req })) {
    return { section: await get<PreactComponent>(section) };
  }
  return { section: null };
};
