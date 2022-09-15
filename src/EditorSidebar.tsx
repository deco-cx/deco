import { useEditor } from "$live/src/EditorProvider.tsx";
import Button from "./ui/Button.tsx";
import JSONSchemaForm from "./ui/JSONSchemaForm.tsx";
import { FormProvider } from "react-hook-form";
import AddNewComponent from "./AddNewComponent.tsx";
import useEditorOperations from "./useEditorForm.tsx";

const DEFAULT_SCHEMA = { title: "default", type: "object", properties: {} };

export default function EditorSidebar() {
  const { componentSchemas, template, components: initialComponents } =
    useEditor();

  const {
    reloadPage,
    saveProps,
    handleAddComponent,
    handleRemoveComponent,
    handleChangeOrder,
    componentsRef,
    methods,
    fields,
  } = useEditorOperations({
    template,
    components: initialComponents,
  });

  const components = componentsRef.current;

  return (
    <div class="bg-white min-h-screen w-3/12 border-l-2 p-2">
      <header class="flex justify-between items-center">
        <h2 class="font-bold text-lg">Editor</h2>
        <div class="flex gap-2">
          <Button
            type="button"
            onClick={reloadPage}
            disabled={!methods.formState.isDirty}
          >
            Descartar
          </Button>
          <Button
            type="button"
            onClick={saveProps}
            disabled={!methods.formState.isDirty}
          >
            Salvar
          </Button>
        </div>
      </header>
      <div class="mt-4">
        <FormProvider {...methods}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {fields.map((field, index) => {
              const { component } = components[index];
              return (
                <JSONSchemaForm
                  key={field.id}
                  changeOrder={handleChangeOrder}
                  removeComponents={handleRemoveComponent}
                  prefix={`components.${index}` as const}
                  index={index}
                  schema={componentSchemas[component] ?? DEFAULT_SCHEMA}
                />
              );
            })}
          </form>
        </FormProvider>

        <AddNewComponent onAddComponent={handleAddComponent} />
      </div>
    </div>
  );
}
