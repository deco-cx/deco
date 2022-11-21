import { Head } from "$fresh/runtime.ts";
import { forwardRef } from "preact/compat";
import ImageKit from "https://esm.sh/imagekit-javascript@1.5.4";
import type { JSX } from "preact";

type Props = Omit<JSX.IntrinsicElements["img"], "width" | "height"> & {
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

const Image = forwardRef<HTMLImageElement, Props>((props, ref) => {
  const { preload, loading = "lazy" } = props;

  const sources = FACTORS.map((factor) => {
    const w = props.width * factor;
    const h = props.height * factor;

    return `${rescale(props.src, w, h)} ${w}w`;
  });

  const srcSet = sources.join(", ");

  const linkProps = {
    imageSrcSet: srcSet,
    imageSizes: props.sizes,
    fetchpriority: props.fetchPriority,
  };

  return (
    <>
      {preload && (
        <Head>
          <link
            as="image"
            rel="preload"
            href={sources[0]}
            {...linkProps}
          />
        </Head>
      )}
      <img
        {...props}
        src={sources[0]}
        srcSet={srcSet}
        loading={loading}
        ref={ref}
      />
    </>
  );
});

export default Image;
