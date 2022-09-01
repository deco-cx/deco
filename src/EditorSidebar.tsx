/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useState } from "preact/hooks";
import { useEditor } from "$live/src/EditorProvider.tsx";
import { tw } from "twind";
import CaretDownIcon from "./icons/CaretDownIcon.tsx";
import TrashIcon from "./icons/TrashIcon.tsx";
import Button from "./ui/Button.tsx";
import NewComponentForm from "./NewComponentForm.tsx";
import PropsInputs from "./ui/PropsInput.tsx";
import JSONSchemaForm, {
  FormProps,
} from "https://esm.sh/@rjsf/core@4.2.3/?alias=react:preact/compat";
import validator from "https://esm.sh/@rjsf/validator-ajv6";

const testSchema: FormProps["schema"] = {
  title: "Product Shelf",
  "type": "object",
  required: ["title", "collection"],
  properties: {
    title: {
      "type": "string",
      title: "Título",
    },
    collection: {
      "type": "string",
      title: "Título",
    },
  },
};

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
        <NewComponentForm
          key={selectedComponent}
          componentSchema={componentSchemas[selectedComponent]}
          componentName={selectedComponent}
          handleSubmit={() => setSelectedComponent("")}
        />
      )}
    </div>
  );
}

export default function EditorSidebar() {
  const {
    components,
    updateComponentProp,
    template,
    changeOrder,
    removeComponents,
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
        <form id="editor-sidebar" onSubmit={(e) => e.preventDefault()}>
          {components.map(({ component, props }, index) => {
            const isFirst = index === 0;
            const isLast = index === components.length - 1;
            return (
              <div class="rounded-md border mb-2 p-2">
                <fieldset key={Math.random()}>
                  <div
                    class={tw`flex justify-between items-center ${
                      props ? "mb-2" : ""
                    }`}
                  >
                    <legend class="font-bold">{component}</legend>
                    <div class="flex gap-2">
                      <Button
                        disabled={isLast}
                        onClick={!isLast
                          ? () => {
                            changeOrder("next", index);
                          }
                          : undefined}
                      >
                        <CaretDownIcon />
                      </Button>
                      <Button
                        disabled={isFirst}
                        onClick={!isFirst
                          ? () => {
                            changeOrder("prev", index);
                          }
                          : undefined}
                      >
                        <CaretDownIcon class="rotate-180" />
                      </Button>
                      <Button
                        onClick={() => removeComponents([index])}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </div>

                  {props && (
                    <PropsInputs
                      props={props}
                      propPrefix=""
                      onInput={(value, prop) => {
                        /* TODO: handle nested values */
                        updateComponentProp({ index, prop, value });
                      }}
                    />
                  )}
                </fieldset>
              </div>
            );
          })}
          <AddNewComponent />
          <br />
          <Button type="button" onClick={saveProps}>
            Salvar
          </Button>
        </form>
        <JSONSchemaForm schema={testSchema} validator={validator} />
      </div>
    </div>
  );
}
