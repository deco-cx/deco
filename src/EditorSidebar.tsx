import { useEditor } from "$live/src/EditorProvider.tsx";
import { FormProvider as FP } from "react-hook-form";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import AddNewComponent from "./AddNewComponent.tsx";
import useEditorOperations from "./useEditorForm.tsx";
import ComponentCard from "./ui/ComponentCard.tsx";
import LinkButton from "./ui/LinkButton.tsx";
import Audience from "./Audience.tsx";
import { signal } from "@preact/signals";
import IconButton from "./ui/IconButton.tsx";
import ArrowLeftIcon from "./icons/ArrowLeftIcon.tsx";
import ComponentPropsForm from "./ui/ComponentPropsForm.tsx";
import type { h } from "preact";
import Draggable from "./Draggable.tsx";

const FormProvider = FP as <TFieldValues extends FieldValues, TContext = any>(
  props: UseFormReturn<TFieldValues, TContext>,
) => h.JSX.Element;

const editorView = signal<"list" | "edit">("list");
const openEditorList = () => {
  editorView.value = "list";
};
const openEditorEdit = () => {
  editorView.value = "edit";
};

const selectedComponent = signal<number | null>(null);
const cleanSelectedComponent = () => {
  selectedComponent.value = null;
};

export default function EditorSidebar() {
  const {
    name,
    componentSchemas,
    template,
    components: initialComponents,
    siteId,
    flag,
  } = useEditor();

  const {
    onSubmit,
    handleAddComponent,
    handleChangeOrder,
    handleRemoveComponent,
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
    <div class="flex-none w-80 shadow-xl text-primary-dark z-10 h-screen overflow-y-auto fixed right-0">
      <div class="p-3 flex gap-2 justify-end border-b border-[#F4F4F4]">
        <LinkButton
          onClick={onSubmit}
          class="bg-[#F4F4F4] text-xs font-semibold"
          disabled={!methods.formState.isDirty}
        >
          Save draft
        </LinkButton>
        <Audience methods={methods} onSubmit={onSubmit} flag={flag} />
      </div>
      <div class="p-4">
        {editorView.value === "list" && (
          <>
            <header class="flex justify-between">
              <h3 class="font-medium text-sm leading-4">{name}</h3>

              <AddNewComponent onAddComponent={handleAddComponent} />
            </header>
            <div class="mt-4 flex flex-col gap-2">
              <Draggable onPosChange={handleChangeOrder}>
                {components.map((_, index) => {
                  const { component } = components[index];
                  const componentTitle = componentSchemas[component]?.title ??
                    component;
                  const hasError =
                    !!(methods.formState.errors.components?.[index]);

                  const handleClickCard = () => {
                    openEditorEdit();
                    selectedComponent.value = index;
                  };
                  return (
                    <ComponentCard
                      key={fields[index].id}
                      removeComponents={handleRemoveComponent}
                      index={index}
                      component={component}
                      componentTitle={componentTitle}
                      onClick={handleClickCard}
                      hasError={hasError}
                    />
                  );
                })}
              </Draggable>
            </div>
          </>
        )}
        <FormProvider {...methods}>
          <form
            onSubmit={onSubmit}
          >
            {editorView.value === "edit" && selectedComponent.value !== null &&
              (
                <header class="flex items-center gap-2 mb-4">
                  <IconButton
                    onClick={() => {
                      openEditorList();
                      cleanSelectedComponent();
                    }}
                    class="bg-transparent"
                  >
                    <ArrowLeftIcon />
                  </IconButton>
                  <h3 class="font-medium text-sm leading-4">
                    {componentSchemas[
                      components[selectedComponent.value].component
                    ].title ?? components[selectedComponent.value].component}
                  </h3>
                </header>
              )}

            {
              /*
               * React Hook Form needs the input in the DOM to catch validation.
               * So, to prevent the user submit the form with invalid values,
               * all fields are rendered and hidded
                * */
            }
            {fields.map((field, index) => {
              const { component } = components[index];
              const componentSchema = componentSchemas[component];

              return (
                <div
                  class={index === selectedComponent.value &&
                      editorView.value === "edit"
                    ? undefined
                    : "hidden"}
                >
                  <ComponentPropsForm
                    key={field.id}
                    prefix={`components.${index}.`}
                    properties={componentSchema.properties}
                    required={componentSchema.required}
                  />
                </div>
              );
            })}
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
