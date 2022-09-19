import type { h } from "preact";

export default function Button(
  props: h.JSX.HTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      {...props}
      class={`border py-1 px-2 rounded transition-colors ease-in ${
        props.disabled
          ? "text-gray-400"
          : "hover:border-black hover:bg-gray-100"
      } ${props.class}`}
    />
  );
}
