import { decryptFromHex } from "../commons/secrets/keys.ts";
import { Context } from "../deco.ts";

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
   * @description Used in dev mode as a environment variable (should not contain spaces or special characters)
   * @pattern ^[a-zA-Z_][a-zA-Z0-9_]*$
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
      if (!Context.active().isDeploy) {
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
