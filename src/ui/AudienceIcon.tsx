export default function AudienceIcon({ disabled }: { disabled?: boolean }) {
  const fill = disabled ? "#003232" : "#ffffff";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      fill={fill}
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" fill="none"></rect>
      <circle
        cx="88"
        cy="108"
        r="52"
        fill="none"
        stroke={fill}
        stroke-miterlimit="10"
        stroke-width="16"
      >
      </circle>
      <path
        d="M155.4,57.9A54.5,54.5,0,0,1,169.5,56a52,52,0,0,1,0,104"
        fill="none"
        stroke={fill}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <path
        d="M16,197.4a88,88,0,0,1,144,0"
        fill="none"
        stroke={fill}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <path
        d="M169.5,160a87.9,87.9,0,0,1,72,37.4"
        fill="none"
        stroke={fill}
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
    </svg>
  );
}
