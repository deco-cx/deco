export default function SaveIcon({ disabled }: { disabled: boolean }) {
  const fill = disabled ? "#003232" : "#2FD180";
  console.log(disabled, fill);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill={fill}
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" fill="none"></rect>
      <path
        d="M216,91.3V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8H164.7a7.9,7.9,0,0,1,5.6,2.3l43.4,43.4A7.9,7.9,0,0,1,216,91.3Z"
        fill="none"
        stroke={fill}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <path
        d="M80,216V152a8,8,0,0,1,8-8h80a8,8,0,0,1,8,8v64"
        fill="none"
        stroke={fill}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <line
        x1="152"
        y1="72"
        x2="96"
        y2="72"
        fill="none"
        stroke={fill}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
    </svg>
  );
}
