import { signal } from "@preact/signals";
import { ComponentChild, h } from "preact";

function DraggableChild(props: h.JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      draggable
      {...props}
    >
      {props.children}
    </div>
  );
}

const from = signal<number | null>(null);
const to = signal<number | null>(null);

const setFrom = (idx: number) => {
  from.value = idx;
};

const setTo = (idx: number) => {
  to.value = idx;
};

interface Props {
  children: ComponentChild[];
  onPosChange: (from: number, to: number) => void;
}

/*
 * Credits for VaishakVk and all react-drag-reorder contribuitors (https://github.com/VaishakVk/react-drag-reorder)
 * This components implements the react-drag-reorder without use classes,
 * due to error related to state not being updated.
 */
export default function Draggable({ children, onPosChange }: Props) {
  const dragDrop = () => {
    let _children = children;
    if (from.value !== null && to.value !== null && from.value !== to.value) {
      const currentElement = children[from.value];
      _children = _children!.filter((_, idx: number) => idx !== from.value);
      _children.splice(to.value, 0, currentElement);
      children = _children;
    }

    if (onPosChange) {
      onPosChange(from.peek()!, to.peek()!);
    }

    from.value = null;
    to.value = null;
  };

  if (!Array.isArray(children)) {
    return children;
  }

  return (
    <>
      {children?.map((child, i) => (
        <DraggableChild
          onDragStart={() => setFrom(i)}
          onDragEnter={() => setTo(i)}
          onDragEnd={dragDrop}
          key={i}
        >
          {child}
        </DraggableChild>
      ))}
    </>
  );
}
