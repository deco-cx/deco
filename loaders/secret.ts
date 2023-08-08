import { decryptFromHex } from "$live/commons/secrets/keys.ts";
import { context } from "$live/live.ts";

/**
 * @title Plain Text Secret (use Secret instead)
 */
export interface Secret {
  get: () => Promise<string | null>;
}

export interface Props {
  /**
   * @title Secret Value
   * @format secret
   */
  encrypted: string;
  /**
   * @title Secret Name
   * @description Used in dev mode as a environment variable
   */
  name?: string;
}

const cache: Record<string, Promise<string>> = {};

/**
 * @title Secret
 */
export default function Secret(
  props: Props,
): Secret {
  return {
    get: (): Promise<string | null> => {
      if (!context.isDeploy) {
        const name = props?.name;
        if (!name) {
          return Promise.resolve(null);
        }
        return Promise.resolve(Deno.env.get(name) ?? null);
      }
      const encrypted = props?.encrypted;
      if (!encrypted) {
        return Promise.resolve(null);
      }
      return cache[encrypted] ??= decryptFromHex(encrypted).then((d) =>
        d.decrypted
      );
    },
  };
}
