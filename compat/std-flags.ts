/**
 * Shim for @std/flags
 * Provides CLI argument parsing compatible with Deno's std/flags
 */

export interface ParseOptions {
  boolean?: string[];
  string?: string[];
  default?: Record<string, unknown>;
  alias?: Record<string, string>;
  negatable?: string[];
  "--"?: boolean;
}

export function parse(
  args: string[],
  options: ParseOptions = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = { _: [], ...options.default };

  const booleans = new Set(options.boolean || []);
  const strings = new Set(options.string || []);
  const aliases = options.alias || {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--") {
      if (options["--"]) {
        result["--"] = args.slice(i + 1);
      } else {
        (result._ as string[]).push(...args.slice(i + 1));
      }
      break;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const eqIndex = key.indexOf("=");

      if (eqIndex !== -1) {
        const name = key.slice(0, eqIndex);
        const value = key.slice(eqIndex + 1);
        setArg(result, name, booleans.has(name) ? value !== "false" : value);
      } else if (booleans.has(key)) {
        setArg(result, key, true);
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        setArg(result, key, args[++i]);
      } else {
        setArg(result, key, strings.has(key) ? "" : true);
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const flags = arg.slice(1);
      for (let j = 0; j < flags.length; j++) {
        const flag = flags[j];
        const resolvedFlag = aliases[flag] || flag;

        if (booleans.has(resolvedFlag)) {
          setArg(result, resolvedFlag, true);
        } else if (j === flags.length - 1 && i + 1 < args.length) {
          setArg(result, resolvedFlag, args[++i]);
        } else {
          setArg(result, resolvedFlag, true);
        }
      }
    } else {
      (result._ as string[]).push(arg);
    }
  }

  return result;

  function setArg(obj: Record<string, unknown>, key: string, value: unknown) {
    obj[key] = value;
    // Handle aliases
    for (const [alias, target] of Object.entries(aliases)) {
      if (target === key) obj[alias] = value;
      if (alias === key) obj[target] = value;
    }
  }
}

