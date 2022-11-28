import { Head } from "$fresh/runtime.ts";
import { forwardRef } from "preact/compat";
import type { JSX } from "preact";

import { getSrcSet } from "./Image.tsx";

type Props =
  & Omit<JSX.IntrinsicElements["video"], "width" | "height" | "preload">
  & {
    width: number;
    height: number;
    src: string;
    preload?: boolean;
    fetchPriority?: "high" | "low" | "auto";
  };

const Video = forwardRef<HTMLVideoElement, Props>((props, ref) => {
  const { preload, loading = "lazy" } = props;

  const srcSet = getSrcSet(props.src, props.width, props.height);
  const linkProps = {
    imagesrcset: srcSet,
    imagesizes: props.sizes,
    fetchpriority: props.fetchPriority,
    media: props.media,
  };

  return (
    <>
      {preload && (
        <Head>
          <link
            as="video"
            rel="preload"
            href={props.src}
            {...linkProps}
          />
        </Head>
      )}
      <video
        {...props}
        preload={undefined}
        src={props.src}
        srcSet={srcSet}
        loading={loading}
        ref={ref}
      />
    </>
  );
});

export default Video;
