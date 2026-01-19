import { UAParser } from "ua-parser-js";
// @ts-ignore - extensions available in newer versions
import { Bots } from "ua-parser-js/extensions";

/**
 * @title {{{.}}}
 */
export type Device = "mobile" | "tablet" | "desktop";

const ideviceToDevice: Record<string, Device> = {
  mobile: "mobile",
  tablet: "tablet",
  console: "desktop",
  smarttv: "desktop",
  wearable: "desktop",
  embedded: "desktop",
};

export const deviceOf = (request: Request) => {
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

  return normalizedDevice;
};

const UABotParser = new UAParser(Bots);

const KNOWN_BOTS = ["Google-InspectionTool"];

export const isBot = (req: Request) => {
  const fromCloudFlare = req.headers.get("cf-verified-bot");

  if (fromCloudFlare === "true") {
    return true;
  }

  if (KNOWN_BOTS.some((bot) => req.headers.get("user-agent")?.includes(bot))) {
    return true;
  }

  const ua = req.headers.get("user-agent") || "";
  const browser = UABotParser.setUA(ua).getBrowser() as unknown as {
    type: string;
  };
  return browser.type === "bot";
};
