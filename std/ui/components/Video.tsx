/**
 * TODO: Implement video preload with link[rel="preload"] tags once
 * browsers support it. More info at: https://stackoverflow.com/a/68368601
 */
import { forwardRef } from "preact/compat";
import type { JSX } from "preact";

import { getSrcSet } from "./Image.tsx";

type Props =
  & Omit<JSX.IntrinsicElements["video"], "width" | "height" | "preload">
  & {
    width: number;
    height: number;
    src: string;
  };

const Video = forwardRef<HTMLVideoElement, Props>((props, ref) => {
  const { loading = "lazy" } = props;
  const srcSet = getSrcSet(props.src, props.width, props.height);

  return (
    <video
      {...props}
      preload={undefined}
      src={props.src}
      srcSet={srcSet}
      loading={loading}
      ref={ref}
    />
  );
});

export default Video;
