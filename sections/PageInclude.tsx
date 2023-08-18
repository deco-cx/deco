import { Page } from "../blocks/page.ts";
import { notUndefined } from "../engine/core/utils.ts";

import {
  Props as LivePageProps,
  useLivePageContext,
} from "../pages/LivePage.tsx";

export interface Props {
  page: Page;
}

export const isLivePageProps = (
  p: Page["props"] | LivePageProps,
): p is LivePageProps => {
  return (p as LivePageProps)?.sections !== undefined;
  // TODO: Uncomment when bring back layout
  // (p as LivePageProps)?.layout !== undefined;
};

export default function PageInclude({ page }: Props) {
  if (!isLivePageProps(page?.props)) {
    return null;
  }

  const { renderSection } = useLivePageContext();

  return (
    <>{(page?.props?.sections ?? []).filter(notUndefined).map(renderSection)}</>
  );
}
