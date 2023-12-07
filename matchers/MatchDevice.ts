import { MatchContext } from "../blocks/matcher.ts";
import { Device, deviceOf } from "../utils/device.ts";

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

  const normalizedDevice = deviceOf(request);

  return devices.includes(normalizedDevice);
};

export default MatchDevice;
