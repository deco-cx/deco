import { UAParser } from "npm:ua-parser-js@2.0.0-beta.2";
import { Bots } from "npm:ua-parser-js@2.0.0-beta.2/extensions";

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

// Cache parsed device results by User-Agent string to avoid re-creating UAParser per call
const deviceByUA = new Map<string, Device>();
const DEVICE_CACHE_MAX_SIZE = 1000;

export const deviceOf = (request: Request): Device => {
  // Short-circuit: use Cloudflare device hint when available (avoids UAParser entirely)
  const cfDeviceHint = request.headers.get("cf-device-type") || "";
  if (cfDeviceHint) {
    return ideviceToDevice[cfDeviceHint] ?? "desktop";
  }

  const ua = request.headers.get("user-agent") || "";
  if (ua) {
    const cached = deviceByUA.get(ua);
    if (cached !== undefined) return cached;

    const parsedType = new UAParser(ua).getDevice().type || "desktop";
    const device = ideviceToDevice[parsedType] ?? "desktop";
    deviceByUA.set(ua, device);
    // Evict oldest entry when cache is full
    if (deviceByUA.size > DEVICE_CACHE_MAX_SIZE) {
      const firstKey = deviceByUA.keys().next().value;
      if (firstKey !== undefined) deviceByUA.delete(firstKey);
    }
    return device;
  }

  // Fallback: check URL search params (only parse URL when actually needed)
  const url = new URL(request.url);
  const hint = url.searchParams.get("deviceHint") || "desktop";
  return ideviceToDevice[hint] ?? "desktop";
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
