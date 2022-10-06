import { useEditor } from "$live/src/EditorProvider.tsx";
import Button from "./ui/Button.tsx";
import JSONSchemaForm from "./ui/JSONSchemaForm.tsx";
import { FormProvider as FP } from "react-hook-form";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import AddNewComponent from "./AddNewComponent.tsx";
import useEditorOperations from "./useEditorForm.tsx";

const FormProvider = FP as <TFieldValues extends FieldValues, TContext = any>(
  props: UseFormReturn<TFieldValues, TContext>,
) => JSX.Element;

const DEFAULT_SCHEMA = { title: "default", type: "object", properties: {} };

export default function EditorSidebar() {
  const {
    componentSchemas,
    template,
    components: initialComponents,
    siteId,
    flag,
  } = useEditor();

  const {
    onReset,
    onSubmit,
    handleAddComponent,
    handleRemoveComponent,
    handleChangeOrder,
    componentsRef,
    methods,
    fields,
  } = useEditorOperations({
    template,
    components: initialComponents,
    siteId,
    flag,
  });

  const components = componentsRef.current;

  return (
    <div class="min-h-screen w-1/3 shadow-xl text-primary-dark">
      <div class="bg-gray-50 p-5 shadow-xl rounded-2xl min-h-full">
        <FormProvider {...methods}>
          <form
            onSubmit={onSubmit}
          >
            <header class="flex justify-between items-center">
              <span class="text-gray-400">last edited...</span>
              <div class="flex gap-2">
                <p
                  class={`cursor-pointer py-1 px-2 ${
                    methods.formState.isDirty
                      ? "text-gray-400 hover:text-gray-500"
                      : "text-gray-400"
                  }`}
                  onClick={onReset}
                  disabled={!methods.formState.isDirty}
                >
                  Descartar
                </p>
                <Button
                  type="submit"
                  disabled={!methods.formState.isDirty}
                >
                  Salvar
                </Button>
              </div>
            </header>
            <div>
              <input
                type="checkbox"
                {...methods.register("experiment")}
              />
              Experiment
            </div>
            <div class="mt-4">
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
            </div>
          </form>
        </FormProvider>
        <AddNewComponent onAddComponent={handleAddComponent} />
      </div>
    </div>
  );
}
