import { useEditor } from "$live/src/EditorProvider.tsx";
import Button from "./ui/Button.tsx";
import JSONSchemaForm from "./ui/JSONSchemaForm.tsx";
import { FormProvider as FP } from "react-hook-form";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import AddNewComponent from "./AddNewComponent.tsx";
import useEditorOperations from "./useEditorForm.tsx";
import SaveIcon from "./ui/SaveIcon.tsx";
import Audience from "./Audience.tsx";

const FormProvider = FP as <TFieldValues extends FieldValues, TContext = any>(
  props: UseFormReturn<TFieldValues, TContext>,
) => JSX.Element;

export default function EditorSidebar() {
  const {
    componentSchemas,
    template,
    components: initialComponents,
    siteId,
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
    flag: null,
  });

  const components = componentsRef.current;

  return (
    <div class="flex-none w-80 shadow-xl text-primary-dark z-10 h-screen overflow-y-auto fixed right-0">
      <div class="bg-gray-50 p-5 min-h-full">
        <FormProvider {...methods}>
          <form
            onSubmit={onSubmit}
          >
            <header class="flex justify-between items-center">
              <Audience methods={methods} onSubmit={onSubmit} />
              <div class="flex gap-2">
                <p
                  class={`cursor-pointer py-1 px-2 text-sm ${
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
                  <span class="pr-1 hidden">
                    <SaveIcon
                      disabled={!methods.formState.isDirty}
                    />
                  </span>
                  Salvar
                </Button>
              </div>
            </header>
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
                    schema={componentSchemas[component] ??
                      { type: "object", properties: {}, title: component }}
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
