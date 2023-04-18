export interface StubSectionProps {
  component: string;
}

export default function StubSection({ component }: StubSectionProps) {
  return (
    <div>Oops! the reference for the component {component} is dangling</div>
  );
}

export function Empty() {
  return null;
}
