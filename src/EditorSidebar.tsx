/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useRef } from "preact/hooks";
import { useEditor } from "$live/src/EditorProvider.tsx";
import { tw } from "twind";
import Button from "./ui/Button.tsx";
import JSONSchemaForm from "./ui/JSONSchemaForm.tsx";
import { FormProvider, useForm } from "react-hook-form";
import type { PageComponentData } from "../types.ts";

function AddNewComponent({ onAddComponent }) {
  const { componentSchemas } = useEditor();
  const selectedComponent = useRef("");

  return (
    <div class="py-1 mb-2">
      Selecione componente para adicionar
      <div class="flex">
        <select
          class={tw`border hover:border-black py-1 px-2 mr-1 rounded transition-colors ease-in`}
          value={"-1"}
          onInput={(e) => {
            selectedComponent.current = e.target.value;
          }}
        >
          {Object.keys(componentSchemas).map((componentName) => (
            <option value={componentName}>
              {componentSchemas[componentName]?.title ?? componentName}
            </option>
          ))}
        </select>
        <Button
          onClick={() => {
            onAddComponent(selectedComponent.current);
            selectedComponent.current = "";
          }}
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function mapComponentsToFormData(components: PageComponentData[]) {
  return components.reduce((curr, component, index) => {
    curr[index] = component.props;
    return curr;
  }, {});
}

function mapFormDataToComponents(
  formData: FormValues,
  currentComponents: PageComponentData[],
) {
  const components: PageComponentData[] = [];
  currentComponents.forEach(({ component }, index) => {
    const props = formData[index];
    components.push({
      component,
      props,
    });
  });

  return components;
}

type FormValues = Record<number, Record<string, unknown>>;

export default function EditorSidebar() {
  const { componentSchemas, template, components: initialComponents } =
    useEditor();
  const componentsRef = useRef(initialComponents);
  const methods = useForm<FormValues>({
    defaultValues: mapComponentsToFormData(initialComponents),
  });

  const reloadPage = () => document.location.reload();
  const saveProps = async () => {
    const components = mapFormDataToComponents(
      methods.getValues(),
      componentsRef.current,
    );

    await fetch("/live/api/editor", {
      method: "POST",
      redirect: "manual",
      body: JSON.stringify({ components, template }),
    });
    reloadPage();
  };

  const handleChangeOrder = (dir: "prev" | "next", pos: number) => {
    let newPos: number;

    if (dir === "prev") {
      newPos = pos - 1;
    } else {
      newPos = pos + 1;
    }

    const components = componentsRef.current;
    if (newPos < 0 || newPos >= components.length) {
      return;
    }

    const prevComp = components[newPos];
    components[newPos] = components[pos];
    components[pos] = prevComp;

    methods.reset(
      mapComponentsToFormData(
        components,
      ),
    );

    // Needs to set this noop value to mimic that form has changed, since has no imperative way to set dirty
    methods.setValue("noop", 0, { shouldDirty: true });
  };

  const handleRemoveComponent = (removedIndex: number) => {
    componentsRef.current = componentsRef.current.filter((_, index) =>
      index !== removedIndex
    );
    const components = componentsRef.current;

    methods.reset(
      mapComponentsToFormData(
        components,
      ),
    );
    // Needs to set this noop value to mimic that form has changed, since has no imperative way to set dirty
    methods.setValue("noop", 0, { shouldDirty: true });
  };

  const handleAddComponent = (componentName: string) => {
    const components = componentsRef.current;
    components.push({ component: componentName });

    methods.reset(
      mapComponentsToFormData(
        components,
      ),
    );
    // Needs to set this noop value to mimic that form has changed, since has no imperative way to set dirty
    methods.setValue("noop", 0, { shouldDirty: true });
  };

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
            {components.map(({
              component,
            }, index) => {
              return (
                <JSONSchemaForm
                  changeOrder={handleChangeOrder}
                  removeComponents={handleRemoveComponent}
                  index={index}
                  schema={componentSchemas[component] ??
                    { title: component, type: "object", properties: {} }}
                />
              );
            })}
          </form>

          <AddNewComponent onAddComponent={handleAddComponent} />
        </FormProvider>
      </div>
    </div>
  );
}
