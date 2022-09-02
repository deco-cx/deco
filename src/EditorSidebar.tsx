/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useState } from "preact/hooks";
import { useEditor } from "$live/src/EditorProvider.tsx";
import { tw } from "twind";
import JSONSchemaForm from "rjsf";
import Button from "./ui/Button.tsx";

function AddNewComponent() {
  const { componentSchemas } = useEditor();
  const [selectedComponent, setSelectedComponent] = useState("");

  return (
    <div class="py-1">
      Selecione componente para adicionar
      <select
        class={tw`border hover:border-black transition-colors ease-in rounded px-2 py-1 mb-2`}
        value={selectedComponent}
        onChange={(e) => setSelectedComponent(e.currentTarget.value)}
      >
        {Object.keys(componentSchemas).map((componentName) => (
          <option value={componentName}>{componentName}</option>
        ))}
      </select>
      {selectedComponent && (
        <JSONSchemaForm
          schema={componentSchemas[selectedComponent] ??
            { title: selectedComponent, type: "object", properties: {} }}
          validator={() => true}
        />
      )}
    </div>
  );
}

export default function EditorSidebar() {
  const {
    components,
    template,
    componentSchemas,
  } = useEditor();

  const saveProps = async () => {
    await fetch("/live/api/editor", {
      method: "POST",
      redirect: "manual",
      body: JSON.stringify({ components, template }),
    });
    document.location.reload();
  };

  return (
    <div class="min-h-screen w-3/12 border-l-2 p-2">
      <header>
        <h2 class="font-bold text-lg">Editor</h2>
      </header>
      <div class="mt-4">
        {components.map(({
          component,
          props,
        }) => {
          return (
            <JSONSchemaForm
              schema={componentSchemas[component] ??
                { title: component, type: "object", properties: {} }}
              validator={() => true}
              formData={props}
            >
              {<Fragment />}
            </JSONSchemaForm>
          );
        })}

        <AddNewComponent />
        <br />
        <Button type="button" onClick={saveProps}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
