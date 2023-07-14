import { MatchContext } from "$live/blocks/matcher.ts";

/**
 * @title {{{city}}} {{{regionCode}}} {{{country}}}
 */
export interface Location {
  /**
   * @title City
   * @example São Paulo
   */
  city?: string;
  /**
   * @title Region Code
   * @example SP
   */
  regionCode?: string;
  /**
   * @title Country
   * @example BR
   */
  country?: string;
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
    if (!target.regionCode && !target.city && !target.country) {
      return defaultNotMatched;
    }
    let result = !target.regionCode || target.regionCode === source.regionCode;
    result &&= !target.city || target.city === source.city;
    result &&= !target.country || target.country === source.country;
    return result;
  };

const escaped = ({ city, country, regionCode }: Location): Location => {
  return {
    regionCode,
    city: city ? decodeURIComponent(escape(city)) : city,
    country: country ? decodeURIComponent(escape(country)) : country,
  };
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
  return includeLocations?.some(matchLocation(true, escaped(userLocation))) ??
    true;
}
