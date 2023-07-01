import { MatchContext } from "$live/blocks/matcher.ts";
import { UAParser } from "https://esm.sh/ua-parser-js@1.0.35";

/**
 * @title {{{.}}}
 */
export type Device = "mobile" | "tablet" | "desktop";

/**
 * @title {{#mobile}}Mobile{{/mobile}} {{#tablet}}Tablet{{/tablet}} {{#desktop}}Desktop{{/desktop}}
 */
export interface Props {
  /**
   * @title Mobile
   */
  mobile?: boolean;
  /**
   * @title Tablet
   */
  tablet?: boolean;
  /**
   * @title Desktop
   */
  desktop?: boolean;
}

// backwards compatibility
interface OldProps {
  devices: Device[];
}

const ideviceToDevice: Record<string, Device> = {
  mobile: "mobile",
  tablet: "tablet",
  console: "desktop",
  smarttv: "desktop",
  wearable: "desktop",
  embedded: "desktop",
};

/**
 * @title Device Matcher
 * @description Matches the user based on the used device, options are: mobile, desktop or tablet.
 */
const MatchDevice = (
  { mobile, tablet, desktop, ...rest }: Props,
  { request }: MatchContext,
) => {
  const devices = (rest as OldProps)?.devices ?? [];
  mobile && devices.push("mobile");
  tablet && devices.push("tablet");
  desktop && devices.push("desktop");
  const url = new URL(request.url);
  const ua: string | null = request.headers.get("user-agent") || "";
  // use cf hint at first and then fallback to user-agent parser.
  const cfDeviceHint: string | null = request.headers.get("cf-device-type") ||
    "";

  const device = cfDeviceHint ||
    (ua && new UAParser(ua).getDevice().type) ||
    url.searchParams.get("deviceHint") ||
    "desktop"; // console, mobile, tablet, smarttv, wearable, embedded

  const normalizedDevice = ideviceToDevice[device] ?? "desktop";

  return devices.includes(normalizedDevice);
};

export default MatchDevice;
