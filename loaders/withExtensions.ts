import { Extension } from "../blocks/extension.ts";

export interface Props<T> {
  data: T;
  extension: Extension;
}

export default async function addExtensions<T>(
  { data, extension }: Props<T>,
): Promise<T> {
  const extended = await extension?.(data);
  return extended?.merged();
}
