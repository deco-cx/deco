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

export interface EditorContext extends Props {}

export const EditorContext = createContext<EditorContext>(
  undefined as unknown as EditorContext,
);

export const useEditor = () => useContext(EditorContext);

export default function EditorProvider(
  { children, components, template, componentSchemas }: Props & {
    children: ComponentChildren;
  },
) {
  return (
    <EditorContext.Provider
      value={{
        components,
        template,
        componentSchemas,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}
