import type { h } from "preact";

export default function PlusIcon(
  { class: className, width = 16, height = 16 }: h.JSX.SVGAttributes<
    SVGElement
  >,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      class={className}
      fill="#2FD180"
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" fill="none"></rect>
      <line
        x1="40"
        y1="128"
        x2="216"
        y2="128"
        fill="none"
        stroke="#2FD180"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
      <line
        x1="128"
        y1="40"
        x2="128"
        y2="216"
        fill="none"
        stroke="#2FD180"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
    </svg>
  );
}
