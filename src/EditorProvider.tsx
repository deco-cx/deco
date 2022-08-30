/** @jsx h */
/** @jsxFrag Fragment */
import { ComponentChildren, createContext, Fragment, h } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { PageComponentData, Schemas } from "../types.ts";

interface Props {
  components: PageComponentData[];
  template: string;
  componentSchemas: Schemas;
}

interface EditorContext extends Props {
  updateComponentProp: (
    { index, prop, value }: { index: number; prop: string; value: any },
  ) => void;
  changeOrder: (dir: "prev" | "next", pos: number) => void;
  addComponents: (newComponents: any[]) => void;
  removeComponents: (removedComponents: number[]) => void;
}

export const EditorContext = createContext<EditorContext>(
  undefined as unknown as EditorContext,
);

export const useEditor = () => useContext(EditorContext);

export default function EditorProvider(
  { children, components: _components, template, componentSchemas }: Props & {
    children: ComponentChildren;
  },
) {
  const [components, setComponents] = useState(_components);

  const updateComponentProp: EditorContext["updateComponentProp"] = useCallback(
    (
      { index, prop, value },
    ) => {
      setComponents((oldComponents) => {
        const oldComponent = oldComponents[index];

        oldComponents[index] = {
          ...oldComponent,
          props: {
            ...(oldComponent.props ?? {}),
            [prop]: value,
          },
        };

        return [...oldComponents];
      });
    },
    [],
  );

  const changeOrder: EditorContext["changeOrder"] = useCallback(
    (dir: "prev" | "next", pos: number) => {
      setComponents((oldComponents) => {
        let newPos: number;

        if (dir === "prev") {
          newPos = pos - 1;
        }

        if (dir === "next") {
          newPos = pos + 1;
        }

        const prevComp = oldComponents[newPos];
        oldComponents[newPos] = oldComponents[pos];
        oldComponents[pos] = prevComp;

        return [...oldComponents];
      });
    },
    [],
  );

  const addComponents: EditorContext["addComponents"] = useCallback(
    (newComponents) => {
      setComponents((oldComponents) => [...oldComponents, ...newComponents]);
    },
    [],
  );

  const removeComponents: EditorContext["removeComponents"] = useCallback(
    (componentIndexes) => {
      setComponents((
        oldComponents,
      ) => [
        ...oldComponents.filter((_, index) =>
          !componentIndexes.includes(index)
        ),
      ]);
    },
    [],
  );

  return (
    <EditorContext.Provider
      value={{
        components,
        updateComponentProp,
        template,
        changeOrder,
        componentSchemas,
        addComponents,
        removeComponents,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}
