import type { h } from "preact";
import { forwardRef } from "preact/compat";

export default forwardRef<
  HTMLButtonElement,
  h.JSX.HTMLAttributes<HTMLButtonElement>
>(function IconButton(
  props,
  ref,
) {
  return (
    <button
      type="button"
      {...props}
      class={`p-1 bg-[#F4F4F4] hover:bg-[#E1E1E1] text-primary rounded flex items-center transition-colors ease-in ${
        props.disabled ? "text-gray-500 bg-gray-200" : ""
      } ${props.class ?? ""}`}
      ref={ref}
    />
  );
});
