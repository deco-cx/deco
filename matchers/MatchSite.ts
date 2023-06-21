import { MatchContext } from "$live/blocks/matcher.ts";

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
