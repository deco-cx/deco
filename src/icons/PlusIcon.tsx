import type { h } from "preact";

export default function PlusIcon(
  { class: className, width = 16, height = 16, fill = "#2FD180" }:
    h.JSX.SVGAttributes<
      SVGElement
    >,
) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 3.3335V12.6668"
        stroke={fill}
        stroke-width="1.33333"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M3.33398 8H12.6673"
        stroke={fill}
        stroke-width="1.33333"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
