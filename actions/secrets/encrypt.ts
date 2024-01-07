import { encryptToHex } from "../../commons/secrets/keys.ts";
import { badRequest } from "../../engine/errors.ts";
import { Context } from "../../deco.ts";
import { ActionContext } from "../../types.ts";
import { allowCorsFor } from "../../utils/http.ts";

export interface Props {
  value: string;
}

export interface SignedMessage {
  value: string;
}

export default async function Encrypt(
  { value }: Props,
  req: Request,
  ctx: ActionContext,
): Promise<SignedMessage> {
  if (!Context.active().isDeploy) {
    badRequest({
      message: "could not update secrets in development mode",
      code: "SECRET_ON_DEV_MODE_NOT_ALLOWED",
    });
  }
  try {
    Object.entries(allowCorsFor(req)).map(([name, value]) => {
      ctx.response.headers.set(name, value);
    });
    return { value: await encryptToHex(value) };
  } catch (err) {
    console.log(err);
    throw err;
  }
}
