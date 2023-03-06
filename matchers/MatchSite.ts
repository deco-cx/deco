import { MatchContext } from "$live/blocks/matcher.ts";

export interface Props {
  siteId: number;
}

const MatchSite = ({ siteId }: Props, { siteId: currSiteId }: MatchContext) => {
  return {
    isMatch: siteId === currSiteId,
    duration: "request",
  };
};

export default MatchSite;
