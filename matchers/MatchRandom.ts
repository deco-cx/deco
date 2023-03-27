import { MatchWithCookieValue } from "$live/handlers/routesSelection.ts";
export interface Props {
  traffic: number;
}

const MatchRandom = (
  { traffic }: Props,
  { isMatchFromCookie }: MatchWithCookieValue,
) => {
  if (isMatchFromCookie !== undefined) {
    return isMatchFromCookie;
  }
  return Math.random() < traffic;
};

export default MatchRandom;
