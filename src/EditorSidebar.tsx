import { useCallback, useRef } from "preact/hooks";
import { useEditor } from "$live/src/EditorProvider.tsx";
import Button from "./ui/Button.tsx";
import JSONSchemaForm from "./ui/JSONSchemaForm.tsx";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import type { PageComponentData } from "../types.ts";
import AddNewComponent from "./AddNewComponent.tsx";

const COMPONENTS_KEY_NAME: "components" = "components" as const;

function mapComponentsToFormData(
  components: PageComponentData[],
): ComponentProp[] {
  return components.map((component) => {
    return component.props || {};
  });
}

function mapFormDataToComponents(
  formData: ComponentProp[],
  currentComponents: PageComponentData[],
) {
  const components: PageComponentData[] = [];
  currentComponents.forEach(({ component }, index) => {
    const props = formData[index];

    components.push({
      component,
      // Required check this, because the form doesn't handle undefined values
      props: Object.keys(props).length === 0 ? undefined : props,
    });
  });

  return components;
}

type ComponentProp = Record<string, any>;
type FormValues = {
  [COMPONENTS_KEY_NAME]: ComponentProp[];
};

export default function EditorSidebar() {
  const { componentSchemas, template, components: initialComponents } =
    useEditor();
  const componentsRef = useRef(initialComponents);
  const components = componentsRef.current;

  const methods = useForm<FormValues>({
    defaultValues: {
      [COMPONENTS_KEY_NAME]: mapComponentsToFormData(initialComponents),
    },
  });
  const { append, fields, remove, swap } = useFieldArray({
    control: methods.control,
    name: COMPONENTS_KEY_NAME,
  });

  const reloadPage = () => document.location.reload();
  const saveProps = async () => {
    const components = mapFormDataToComponents(
      methods.getValues(COMPONENTS_KEY_NAME),
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

    if (newPos < 0 || newPos >= components.length) {
      return;
    }

    const prevComp = components[newPos];
    components[newPos] = components[pos];
    components[pos] = prevComp;

    swap(pos, newPos);
  };

  const handleRemoveComponent = (removedIndex: number) => {
    componentsRef.current = componentsRef.current.filter((_, index) =>
      index !== removedIndex
    );

    remove(removedIndex);
  };

  const handleAddComponent = useCallback((componentName: string) => {
    const _components = componentsRef.current;
    _components.push({ component: componentName });

    append({});
  }, [componentsRef]);

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
