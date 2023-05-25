import { MatchContext } from "$live/blocks/matcher.ts";
import { UAParser } from "https://esm.sh/ua-parser-js@1.0.35";

export type Device = "mobile" | "tablet" | "desktop";
export interface Props {
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
  { devices }: Props,
  { request }: MatchContext,
) => {
  const ua: string | null = request.headers.get("user-agent") || "";
  // use cf hint at first and then fallback to user-agent parser.
  const cfDeviceHint: string | null = request.headers.get("cf-device-type") ||
    "";

  const device = cfDeviceHint ||
    (ua && new UAParser(ua).getDevice().type) ||
    "desktop"; // console, mobile, tablet, smarttv, wearable, embedded

  const normalizedDevice = ideviceToDevice[device] ?? "desktop";

  return devices.includes(normalizedDevice);
};

export default MatchDevice;
