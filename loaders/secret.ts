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

/**
 * @title Secret
 */
export default function Secret(
  props: Props,
): Secret {
  let decrypted: Promise<string> | null = null;
  return {
    get: async (): Promise<string | null> => {
      return await (decrypted ??= props.encrypted
        ? decryptFromHex(props?.encrypted).then((
          { decrypted: value },
        ) => value)
        : null);
    },
  };
}
