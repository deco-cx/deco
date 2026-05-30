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

const deviceCache = new WeakMap<Request, Device>();

export const deviceOf = (request: Request): Device => {
  const cached = deviceCache.get(request);
  if (cached !== undefined) return cached;

  const cfDeviceHint = request.headers.get("cf-device-type") || "";
  let device: string;

  if (cfDeviceHint) {
    device = cfDeviceHint;
  } else {
    const ua = request.headers.get("user-agent") || "";
    if (ua) {
      device = new UAParser(ua).getDevice().type || "";
    } else {
      device = "";
    }
    if (!device) {
      const qIdx = request.url.indexOf("?");
      if (qIdx !== -1) {
        const params = new URLSearchParams(request.url.slice(qIdx));
        device = params.get("deviceHint") || "desktop";
      } else {
        device = "desktop";
      }
    }
  }

  const result = ideviceToDevice[device] ?? "desktop";
  deviceCache.set(request, result);
  return result;
};

const UABotParser = new UAParser(Bots);

const KNOWN_BOTS = ["Google-InspectionTool"];

const botCache = new WeakMap<Request, boolean>();

export const isBot = (req: Request): boolean => {
  const cached = botCache.get(req);
  if (cached !== undefined) return cached;

  let result = false;

  const fromCloudFlare = req.headers.get("cf-verified-bot");
  if (fromCloudFlare === "true") {
    result = true;
  } else if (
    KNOWN_BOTS.some((bot) => req.headers.get("user-agent")?.includes(bot))
  ) {
    result = true;
  } else {
    const ua = req.headers.get("user-agent") || "";
    const browser = UABotParser.setUA(ua).getBrowser() as unknown as {
      type: string;
    };
    result = browser.type === "bot";
  }

  botCache.set(req, result);
  return result;
};
