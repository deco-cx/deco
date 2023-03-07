import { MatchContext } from "$live/blocks/matcher.ts";

export interface Props {
  siteId: number;
}

const MatchSite = ({ siteId }: Props, { siteId: currSiteId }: MatchContext) => {
  return siteId === currSiteId;
};

export default MatchSite;
