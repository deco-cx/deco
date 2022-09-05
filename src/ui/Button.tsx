/* @jsx h */
import { h } from "preact";
import { tw } from "twind";

export default function Button(
  props: h.JSX.HTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      {...props}
      class={tw`border hover:border-black py-1 px-2 rounded transition-colors ease-in ${
        !props.disabled ? "hover:bg-gray-100" : ""
      } ${props.class}`}
    />
  );
}
