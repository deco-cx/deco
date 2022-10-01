import type { h } from "preact";

export default function Button(
  props: h.JSX.HTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      {...props}
      class={`border border-primary-dark py-1 px-2 bg-primary-dark text-primary rounded transition-colors ease-in ${
        props.disabled ? "text-gray-500 bg-gray-200" : "hover:border-black"
      } ${props.class}`}
    />
  );
}
