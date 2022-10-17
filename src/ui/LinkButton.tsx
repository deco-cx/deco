import type { h } from "preact";

export default function LinkButton(
  props: h.JSX.HTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      {...props}
      class={`rounded hover:bg-[#E1E1E1] py-1 px-2 flex items-center transition-colors ease-in ${
        props.disabled ? "text-gray-500 bg-gray-200" : ""
      } ${props.class ?? ""}`}
    />
  );
}
