import { Vault } from "$live/blocks/secret.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";

export interface Props {
  /**
   * @format secret
   */
  secret: string;
}

const vault: Record<string, string> = Deno.env.has("DECO_SECRETS")
  ? {}
  : JSON.parse(atob(Deno.env.get("DECO_SECRETS")!));

export default function Secret(props: Props): Vault {
  return {
    use: <TResult = unknown>(
      cb: (key: string) => PromiseOrValue<TResult>,
    ): PromiseOrValue<TResult> => {
      return cb(vault[props.secret]);
    },
  };
}
