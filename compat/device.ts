/**
 * Device Detection Compat
 * Cross-runtime device detection that works without Preact context
 */

export type Device = "mobile" | "tablet" | "desktop";

// Server-side device storage (per-request in async context)
let currentDevice: Device = "desktop";

/**
 * Set the current device (called by middleware)
 */
export function setDevice(device: Device): void {
  currentDevice = device;
}

/**
 * Get the current device
 */
export function getDevice(): Device {
  return currentDevice;
}

/**
 * Detect device from User-Agent string
 */
export function detectDeviceFromUA(userAgent: string): Device {
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return "mobile";
  }
  if (/tablet|ipad/i.test(ua)) {
    return "tablet";
  }
  return "desktop";
}

/**
 * Hook to get current device type
 * On server: returns device detected from User-Agent (via middleware)
 * On client: detects from window.innerWidth
 */
export function useDevice(): Device {
  if (typeof window !== "undefined") {
    // Client-side detection based on viewport width
    const width = window.innerWidth;
    if (width < 768) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  }
  // Server-side: use the device set by middleware
  return currentDevice;
}

