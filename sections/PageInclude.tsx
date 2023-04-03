import { Page } from "$live/blocks/page.ts";
import { notUndefined } from "$live/engine/core/utils.ts";

import {
  Props as LivePageProps,
  renderSection,
} from "$live/pages/LivePage.tsx";

export interface Props {
  page: Page;
}

const isLivePageProps = (
  p: Page["props"] | LivePageProps,
): p is LivePageProps => {
  return (p as LivePageProps)?.sections !== undefined;
};

export default function PageInclude({ page }: Props) {
  if (!isLivePageProps(page?.props)) {
    return null;
  }
  return (
    <>{(page?.props?.sections ?? []).filter(notUndefined).map(renderSection)}</>
  );
}
