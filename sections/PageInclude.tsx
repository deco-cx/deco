import { Page } from "$live/blocks/page.ts";
import { notUndefined } from "$live/engine/core/utils.ts";

import {
  Props as LivePageProps,
  renderSectionFor,
} from "$live/pages/LivePage.tsx";

export interface Props {
  page: Page;
}

export const isLivePageProps = (
  p: Page["props"] | LivePageProps,
): p is LivePageProps => {
  return (p as LivePageProps)?.sections !== undefined ||
    (p as LivePageProps)?.layout !== undefined;
};

export default function PageInclude({ page, ...rest }: Props) {
  if (!isLivePageProps(page?.props)) {
    return null;
  }

  const renderSection = renderSectionFor((rest as any).editMode);

  return (
    <>{(page?.props?.sections ?? []).filter(notUndefined).map(renderSection)}</>
  );
}
