import { useContext, useMemo } from "preact/hooks";
import { forwardRef } from "preact/compat";
import { ComponentChildren, createContext, JSX } from "preact";
import { Head } from "$fresh/runtime.ts";

import { getSrcSet } from "./Image.tsx";

interface Context {
  preload?: boolean;
}

const Context = createContext<Context>({
  preload: false,
});

type SourceProps =
  & Omit<JSX.IntrinsicElements["source"], "width" | "height" | "preload">
  & {
    src: string;
    width: number;
    height: number;
    preload?: boolean;
    fetchPriority?: "high" | "low" | "auto";
  };

const Source = forwardRef<HTMLSourceElement, SourceProps>((props, ref) => {
  const { preload } = useContext(Context);

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
      <source
        {...props}
        preload={undefined}
        src={undefined} // Avoid deprecated api lighthouse warning
        srcSet={srcSet}
        ref={ref}
      />
    </>
  );
});

type Props = Omit<JSX.IntrinsicElements["picture"], "preload"> & {
  children: ComponentChildren;
  preload?: boolean;
};

function Picture({ children, preload, ...props }: Props) {
  const value = useMemo(() => ({ preload }), [preload]);

  return (
    <Context.Provider value={value}>
      <picture {...props}>
        {children}
      </picture>
    </Context.Provider>
  );
}

Picture.Source = Source;

export default Picture;
