import { Head } from "$fresh/runtime.ts";
import ImageKit from "https://esm.sh/imagekit-javascript@1.5.4";
import type { ComponentType, JSX } from "preact";

type Props<T extends "img" | "source" = "img"> =
  & Omit<JSX.IntrinsicElements[T], "width" | "height" | "preload" | "as">
  & {
    as?: T;
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
  FACTORS.map((factor) => {
    const w = width * factor;
    const h = height * factor;

    return `${rescale(src, w, h)} ${w}w`;
  });

const Image = <T extends "img" | "source">(props: Props<T>) => {
  const { preload, loading = "lazy", as = "img" } = props;
  const Component = as as unknown as ComponentType<JSX.IntrinsicElements[T]>;

  const sources = getSrcSet(props.src, props.width, props.height);
  const srcSet = sources.join(", ");

  const linkProps = {
    imagesrcset: srcSet,
    imagesizes: props.sizes,
    fetchpriority: props.fetchPriority,
    media: props.media
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
      <Component
        {...props}
        preload={undefined}
        src={props.src}
        srcSet={srcSet}
        loading={loading}
      />
    </>
  );
};

export default Image;
