import { Head } from "$fresh/runtime.ts";
import { forwardRef } from "preact/compat";
import ImageKit from "https://esm.sh/imagekit-javascript@1.5.4";
import type { JSX } from "preact";

type Props =
  & Omit<JSX.IntrinsicElements["img"], "width" | "height" | "preload">
  & {
    width: number;
    height: number;
    src: string;
    preload?: boolean;
    fetchPriority?: "high" | "low" | "auto";
  };

const imageKit = new ImageKit({
  urlEndpoint: "https://ik.imagekit.io/decocx",
});

const FACTORS = [1, 2, 3];

export const rescale = (
  src: string,
  width: string | number,
  height: string | number,
) =>
  imageKit.url({
    path: src,
    transformation: [{
      width: width.toString(),
      height: height.toString(),
    }],
  });

export const getSrcSet = (src: string, width: number, height: number) =>
  FACTORS
    .map((factor) => {
      const w = width * factor;
      const h = height * factor;

      return `${rescale(src, w, h)} ${w}w`;
    })
    .join(", ");

const Image = forwardRef<HTMLImageElement, Props>((props, ref) => {
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
            as="image"
            rel="preload"
            href={props.src}
            {...linkProps}
          />
        </Head>
      )}
      <img
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

export default Image;
