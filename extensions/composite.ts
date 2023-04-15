import { Extended, Extension } from "$live/blocks/extension.ts";
import { notUndefined } from "$live/engine/core/utils.ts";
import { deepMergeArr } from "$live/utils/object.ts";
import { DeepPartial } from "$live/deps.ts";

export interface Props {
  extensions: Extension[];
}
const apply = <T, R>(param: T) => (f: (arg: T) => Promise<R>) => f(param);

export default function composite({ extensions }: Props) {
  return async <TData>(data: TData) => {
    const applied = (await Promise.all(
      extensions?.filter(notUndefined).map(
        apply(data),
      ),
    )) as Extended<TData>[];
    return applied.reduce(
      (finalObj, extended) =>
        deepMergeArr<DeepPartial<TData>>(
          finalObj,
          extended.value as DeepPartial<DeepPartial<TData>>,
        ),
      {} as DeepPartial<TData>,
    );
  };
}
