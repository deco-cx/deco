import { BlockDefinitions } from "$live/engine/block.ts";
import { tsTypeToSchemeable } from "$live/engine/schema/transform.ts";
import { findAllExtends } from "$live/engine/schema/utils.ts";
import { DataBlock } from "../engine/block.ts";

const brand = Symbol();

export interface Account {
  [brand]: never;
}

const blockType = "account";
const accountBlock: DataBlock<Account> = {
  import: import.meta.url,
  type: blockType,
  adapt: (interceptor) => (account, ctx) => {
    if (interceptor) {
      return interceptor(account, ctx);
    }
    return account;
  },
  findModuleDefinitions: async (transformContext, [path, ast]) => {
    const tps = await Promise.all(
      findAllExtends(
        { typeName: "Account", importUrl: import.meta.url },
        ast
      ).map((fn) => tsTypeToSchemeable(transformContext, fn, [path, ast]))
    );

    return tps.reduce(
      (def, fn) => {
        const defnz = { ...def, schemeables: [...def.schemeables, fn] };
        if (!fn.id) {
          return defnz;
        }
        const [defaultImport] = fn.id.split("@");
        return { ...defnz, imports: [...defnz.imports, defaultImport] };
      },
      { imports: [], schemeables: [] } as BlockDefinitions
    );
  },
};

export default accountBlock;
