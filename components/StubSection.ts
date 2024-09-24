import { jsxs as _jsxs } from "preact/jsx-runtime";
export interface StubSectionProps {
  component: string;
}

export default function StubSection({ component }: StubSectionProps) {
  return /*#__PURE__*/ _jsxs("div", {
    children: [
      "Oops! the reference for the component ",
      component,
      " is dangling",
    ],
  });
}

export function Empty() {
  return null;
}
