/**
 * Shim for @std/fmt/colors
 * Provides terminal color functions (ANSI escape codes)
 */

const enabled = typeof process !== "undefined" &&
  process.stdout?.isTTY !== false;

const code = (open: number, close: number) => {
  return enabled
    ? (str: string) => `\x1b[${open}m${str}\x1b[${close}m`
    : (str: string) => str;
};

export const reset = code(0, 0);
export const bold = code(1, 22);
export const dim = code(2, 22);
export const italic = code(3, 23);
export const underline = code(4, 24);
export const inverse = code(7, 27);
export const hidden = code(8, 28);
export const strikethrough = code(9, 29);

export const black = code(30, 39);
export const red = code(31, 39);
export const green = code(32, 39);
export const yellow = code(33, 39);
export const blue = code(34, 39);
export const magenta = code(35, 39);
export const cyan = code(36, 39);
export const white = code(37, 39);
export const gray = code(90, 39);
export const grey = gray;

export const brightBlack = code(90, 39);
export const brightRed = code(91, 39);
export const brightGreen = code(92, 39);
export const brightYellow = code(93, 39);
export const brightBlue = code(94, 39);
export const brightMagenta = code(95, 39);
export const brightCyan = code(96, 39);
export const brightWhite = code(97, 39);

export const bgBlack = code(40, 49);
export const bgRed = code(41, 49);
export const bgGreen = code(42, 49);
export const bgYellow = code(43, 49);
export const bgBlue = code(44, 49);
export const bgMagenta = code(45, 49);
export const bgCyan = code(46, 49);
export const bgWhite = code(47, 49);

export const bgBrightBlack = code(100, 49);
export const bgBrightRed = code(101, 49);
export const bgBrightGreen = code(102, 49);
export const bgBrightYellow = code(103, 49);
export const bgBrightBlue = code(104, 49);
export const bgBrightMagenta = code(105, 49);
export const bgBrightCyan = code(106, 49);
export const bgBrightWhite = code(107, 49);

// RGB functions
export function rgb8(str: string, color: number): string {
  return enabled ? `\x1b[38;5;${color}m${str}\x1b[39m` : str;
}

export function bgRgb8(str: string, color: number): string {
  return enabled ? `\x1b[48;5;${color}m${str}\x1b[49m` : str;
}

export function rgb24(str: string, color: { r: number; g: number; b: number }): string {
  return enabled
    ? `\x1b[38;2;${color.r};${color.g};${color.b}m${str}\x1b[39m`
    : str;
}

export function bgRgb24(str: string, color: { r: number; g: number; b: number }): string {
  return enabled
    ? `\x1b[48;2;${color.r};${color.g};${color.b}m${str}\x1b[49m`
    : str;
}

export function stripColor(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

