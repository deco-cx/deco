/* @jsx h */
import { h } from "preact";
import { tw } from "twind";
import { useState } from "preact/hooks";
import { Schema } from "../types.ts";
import { deepClone, setValue } from "../utils/object.ts";
import { useEditor } from "./EditorProvider.tsx";
import PropsInputs from "./ui/PropsInput.tsx";
import Button from "./ui/Button.tsx";

interface Props {
  componentSchema: Schema;
  handleSubmit: () => void;
  componentName: string;
}

export default function NewComponentForm(
  { componentSchema, componentName, handleSubmit }: Props,
) {
  const { addComponents } = useEditor();
  const [props, setProps] = useState(
    deepClone(componentSchema || {}),
  );

  const handleChange = (value: any, path: string) => {
    setProps((oldProps) => setValue(oldProps, path, value));
  };

  return (
    <div class={componentSchema ? tw`rounded-md border p-2` : ""}>
      {componentSchema
        ? (
          <form class={tw`flex flex-col items-start mb-2`}>
            {/* TODO: improve performance related to setState.*/}
            <PropsInputs props={props} propPrefix="" onInput={handleChange} />
          </form>
        )
        : null}
      <Button
        type="button"
        onClick={() => {
          addComponents([{
            component: componentName,
            props: componentSchema ? props : undefined,
          }]);
          handleSubmit();
        }}
      >
        Adicionar componente
      </Button>
    </div>
  );
}
