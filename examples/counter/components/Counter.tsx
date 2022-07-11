/** @jsx h */
import { h } from "preact";
import { tw } from "twind";
import { useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface CounterProps {
  start: number;
}

export const defaultProps = {
  start: 1,
};

export default function Counter(props: CounterProps) {
  const [count, setCount] = useState(props.start);
  const btnClass = tw`px-2 py-1 border(gray-100 1) hover:bg-sand`;
  return (
    <div class="flex gap-2 w-full">
      <p class="flex-grow-1 font-bold text-xl">{count}</p>
      <button
        class={btnClass}
        onClick={() => setCount(count - 1)}
        disabled={!IS_BROWSER}
      >
        -1
      </button>
      <button
        class={btnClass}
        onClick={() => setCount(count + 1)}
        disabled={!IS_BROWSER}
      >
        +1
      </button>
    </div>
  );
}
