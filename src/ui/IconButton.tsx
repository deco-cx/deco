import type { h } from "preact";
import { forwardRef } from "preact/compat";

export default forwardRef<HTMLButtonElement>(function IconButton(
  props: h.JSX.HTMLAttributes<HTMLButtonElement>,
  ref,
) {
  return (
    <button
      type="button"
      {...props}
      class={`py-1 px-2 hover:bg-[#E1E1E1] text-primary rounded flex items-center transition-colors ease-in ${
        props.disabled ? "text-gray-500 bg-gray-200" : ""
      } ${props.class ?? ""}`}
      ref={ref}
    />
  );
});
