import type { h } from "preact";

export default function CaretDownIcon(
  { class: className, width = 16, height = 16, fill = "#2FD180" }:
    h.JSX.SVGAttributes<
      SVGElement
    >,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill={fill}
      width={width}
      height={height}
      viewBox="0 0 256 256"
      class={className}
    >
      <rect width="256" height="256" fill="none"></rect>
      <polyline
        points="208 96 128 176 48 96"
        fill="none"
        stroke={fill}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </polyline>
    </svg>
  );
}
