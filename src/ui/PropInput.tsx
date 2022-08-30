/* @jsx h */
/* @jsxFrag Fragment */
import { tw } from "twind";
import { Fragment, h } from "preact";

export interface Props extends h.JSX.HTMLAttributes<HTMLInputElement> {
  /**
   * Input Label
   */
  prop: string;
}

export default function PropInput({ prop, ...props }: Props) {
  return (
    <>
      <label for={prop}>{prop}</label>
      <input
        {...props}
        class={tw`border rounded p-1 w-full ${props.class}`}
      />
    </>
  );
}
