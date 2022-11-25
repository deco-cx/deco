import type { ComponentChildren, JSX } from "preact";

import Image from "./Image.tsx";

type SourceProps =
  & Omit<JSX.IntrinsicElements["source"], "width" | "height" | "preload">
  & {
    src: string;
    width: number;
    height: number;
    preload?: boolean;
    fetchPriority?: "high" | "low" | "auto";
  };

function Source(props: SourceProps) {
  return <Image {...props} as="source" />;
}

type Props = JSX.IntrinsicElements["picture"] & {
  children: ComponentChildren;
};

function Picture({ children, ...props }: Props) {
  return (
    <picture {...props}>
      {children}
    </picture>
  );
}

Picture.Source = Source;

export default Picture;
