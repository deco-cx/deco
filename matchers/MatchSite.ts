import { MatchContext } from "../blocks/matcher.ts";

/**
 * @title {{{siteId}}}
 */
export interface Props {
  siteId: number;
}

/**
 * @title Site Matcher
 */
const MatchSite = ({ siteId }: Props, { siteId: currSiteId }: MatchContext) => {
  return siteId === currSiteId;
};

export default MatchSite;
