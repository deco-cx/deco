/** @jsx h */
/** @jsxFrag Fragment */
import { ComponentChildren, createContext, Fragment, h } from "preact";
import { useContext, useState } from "preact/hooks";
import { ZodObject } from "zod";

interface Props {
  components: ({ component: string; props: any } & {
    id: string;
    schema: ZodObject<any>;
  })[];
  template: string;
}

interface EditorContext extends Props {
  updateComponentProp: (
    { index, prop, value }: { index: number; prop: string; value: any },
  ) => void;
}

export const EditorContext = createContext<EditorContext>(
  undefined as unknown as EditorContext,
);

export const useEditor = () => useContext(EditorContext);

export default function EditorProvider(
  { children, components: _components, template }: Props & {
    children: ComponentChildren;
  },
) {
  const [components, setComponents] = useState(_components);

  const updateComponentProp: EditorContext["updateComponentProp"] = (
    { index, prop, value },
  ) => {
    const oldComponent = components[index];
    components[index] = {
      ...oldComponent,
      props: {
        ...(oldComponent.props ?? {}),
        [prop]: value,
      },
    };

    setComponents([...components]);
  };

  return (
    <EditorContext.Provider
      value={{ components, updateComponentProp, template }}
    >
      {children}
    </EditorContext.Provider>
  );
}
