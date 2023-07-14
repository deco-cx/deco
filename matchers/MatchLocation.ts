import { MatchContext } from "$live/blocks/matcher.ts";

/**
 * @title {{{city}}} {{{country}}} {{{postalCode}}}
 */
export interface Location {
  /**
   * @title City
   * @example São Paulo
   */
  city?: string;
  /**
   * @title Country
   * @example Brazil
   */
  country?: string;
  /**
   * @title Postal Code
   * @example 58033000
   */
  postalCode?: string;
}

export interface Props {
  /**
   * @title Include Locations
   */
  includeLocations?: Location[];
  /**
   * @title Exclude Locations
   */
  excludeLocations?: Location[];
}

const matchLocation =
  (defaultNotMatched = true, source: Location) => (target: Location) => {
    if (!target.postalCode && !target.city && !target.country) {
      return defaultNotMatched;
    }
    let result = !target.postalCode || target.postalCode === source.postalCode;
    result &&= !target.city || target.city === source.city;
    result &&= !target.country || target.country === source.country;
    return result;
  };

/**
 * @title Location Matcher
 */
export default function MatchLocation(
  { includeLocations, excludeLocations }: Props,
  { request }: MatchContext,
) {
  const city = request.headers.get("cf-ipcity") ?? undefined;
  const country = request.headers.get("cf-ipcountry") ?? undefined;
  const postalCode = request.headers.get("cf-postal-code") ?? undefined;
  const userLocation = { city, country, postalCode };
  const isLocationExcluded = excludeLocations?.some(
    matchLocation(false, userLocation),
  ) ?? false;
  if (isLocationExcluded) {
    return false;
  }
  return includeLocations?.some(matchLocation(true, userLocation)) ?? true;
}
