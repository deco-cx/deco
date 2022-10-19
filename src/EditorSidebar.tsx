import { useEditor } from "$live/src/EditorProvider.tsx";
import { FormProvider as FP } from "react-hook-form";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import AddNewComponent from "./AddNewComponent.tsx";
import useEditorOperations from "./useEditorForm.tsx";
import ComponentCard from "./ui/ComponentCard.tsx";
import LinkButton from "./ui/LinkButton.tsx";
import Audience from "./Audience.tsx";

const FormProvider = FP as <TFieldValues extends FieldValues, TContext = any>(
  props: UseFormReturn<TFieldValues, TContext>,
) => JSX.Element;

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
    <div class="flex-none w-80 shadow-xl text-primary-dark z-10 h-screen overflow-y-auto fixed right-0">
      <div class="p-3 flex gap-2 justify-end border-b border-[#F4F4F4]">
        <LinkButton
          onClick={onSubmit}
          class="bg-[#F4F4F4] text-xs font-semibold"
        >
          Save draft
        </LinkButton>
        <Audience methods={methods} onSubmit={onSubmit} flag={flag} />
      </div>
      <div class="p-4">
        <header class="flex justify-between">
          <h3 class="font-medium text-sm leading-4">{name}</h3>

          <AddNewComponent onAddComponent={handleAddComponent} />
        </header>
        <div class="mt-4 flex flex-col gap-2">
          {fields.map((field, index) => {
            const { component } = components[index];
            const componentLabel = componentSchemas[component]?.title ??
              component;
            return (
              <ComponentCard
                key={field.id}
                removeComponents={handleRemoveComponent}
                index={index}
                component={component}
                componentLabel={componentLabel}
              />
            );
          })}
        </div>
        {/* <header class="flex justify-between items-center"> */}
        {/* <Audience methods={methods} onSubmit={onSubmit} flag={flag} /> */}
        {/* <div class="flex gap-2"> */}
        {/* <p */}
        {/* class={`cursor-pointer py-1 px-2 text-sm ${ */}
        {/* methods.formState.isDirty */}
        {/* ? "text-gray-400 hover:text-gray-500" */}
        {/* : "text-gray-400" */}
        {/* }`} */}
        {/* onClick={onReset} */}
        {/* disabled={!methods.formState.isDirty} */}
        {/* > */}
        {/* Descartar */}
        {/* </p> */}
        {/* <Button */}
        {/* type="submit" */}
        {/* disabled={!methods.formState.isDirty} */}
        {/* > */}
        {/* <span class="pr-1 hidden"> */}
        {/* <SaveIcon */}
        {/* disabled={!methods.formState.isDirty} */}
        {/* /> */}
        {/* </span> */}
        {/* Salvar */}
        {/* </Button> */}
        {/* </div> */}
        {/* </header> */}
        <FormProvider {...methods}>
          <form
            onSubmit={onSubmit}
          >
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
