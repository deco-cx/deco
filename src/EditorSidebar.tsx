/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useRef, useState } from "preact/hooks";
import { useEditor } from "$live/src/EditorProvider.tsx";
import { tw } from "twind";
import Button from "./ui/Button.tsx";
import JSONSchemaForm from "./ui/JSONSchemaForm.tsx";
import { FormProvider, useForm } from "react-hook-form";
import { PageComponentData, Schemas } from "../types.ts";

function AddNewComponent({ onAddComponent }) {
  const { componentSchemas } = useEditor();
  const selectedComponent = useRef("");

  return (
    <div class="py-1 mb-2">
      Selecione componente para adicionar
      <select
        class={tw`border hover:border-black py-1 px-2 mr-1 rounded transition-colors ease-in`}
        value={""}
        onInput={(e) => {
          selectedComponent.current = e.target.value;
          console.log();
        }}
      >
        {Object.keys(componentSchemas).map((componentName) => (
          <option value={componentName}>{componentName}</option>
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
  Object.entries(formData).forEach(([index, props]) => {
    const component = currentComponents[index].component;
    components.push({
      component,
      props,
    });
  });

  return components;
}

type FormValues = Record<number, Record<string, unknown>>;

interface Props {
  components: PageComponentData[];
  template: string;
  componentSchemas: Schemas;
}

export default function EditorSidebar(
  { componentSchemas, template, components: initialComponents }: Props,
) {
  const componentsRef = useRef(initialComponents);
  const methods = useForm<FormValues>({
    defaultValues: mapComponentsToFormData(initialComponents),
  });

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
    document.location.reload();
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

    methods.reset(mapComponentsToFormData(components));
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
  };

  const handleAddComponent = (componentName: string) => {
    componentsRef.current.push({ component: componentName });
    methods.reset(mapComponentsToFormData(componentsRef.current));
  };

  const components = componentsRef.current;

  return (
    <div class="min-h-screen w-3/12 border-l-2 p-2">
      <header>
        <h2 class="font-bold text-lg">Editor</h2>
      </header>
      <div class="mt-4">
        <FormProvider {...methods}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("Submit", methods.getValues());
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

        <br />
        <Button type="button" onClick={saveProps}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
