import type { h } from "preact";

export default function Button(
  props: h.JSX.HTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      {...props}
      class={`py-1 px-2 bg-primary-dark text-primary rounded flex items-center transition-colors ease-in ${
        props.disabled ? "text-gray-500 bg-gray-200" : "shadow-md"
      } ${props.class}`}
    />
  );
}
