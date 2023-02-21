import { Block } from "$live/block.ts";
import { findAllExtends } from "$live/engine/schema/utils.ts";
import { Json } from "../previews/Json.tsx";

const brand = Symbol();

export interface Account {
  [brand]: never;
}

const accountBlock: Block<Account> = {
  preview: (account) => {
    return {
      Component: Json,
      props: {
        obj: JSON.stringify(account),
      },
    };
  },
  run: (account) => {
    return Response.json(account, { status: 200 });
  },
  type: "account",
  intercept: (interceptor) => (account, ctx) => {
    if (interceptor) {
      return interceptor(account, ctx);
    }
    return account;
  },
  findModuleDefinitions: (ast) => {
    const fns = findAllExtends(
      { typeName: "Account", importUrl: import.meta.url },
      ast
    );
    return fns.map((type) => {
      return {
        name: type.repr,
        type,
      };
    });
  },
};

export default accountBlock;
