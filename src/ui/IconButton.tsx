import type { h } from "preact";

export default function IconButton(
  props: h.JSX.HTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      {...props}
      class={`py-1 px-2 hover:bg-[#E1E1E1] text-primary rounded flex items-center transition-colors ease-in ${
        props.disabled ? "text-gray-500 bg-gray-200" : ""
      } ${props.class ?? ""}`}
    />
  );
}
