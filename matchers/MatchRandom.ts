import { MatchWithCookieValue } from "$live/handlers/routesSelection.ts";
export interface Props {
  traffic: number;
}

const MatchRandom = (
  { traffic }: Props,
  { isMatchFromCookie }: MatchWithCookieValue
) => {
  return isMatchFromCookie || Math.random() < traffic;
};

export default MatchRandom;
