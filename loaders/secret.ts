import { decryptFromHex } from "$live/commons/secrets/keys.ts";

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
