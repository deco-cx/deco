import { useCallback, useRef } from "preact/hooks";
import { useFieldArray, useForm } from "react-hook-form";
import { PageComponentData } from "../types.ts";

const COMPONENTS_KEY_NAME: "components" = "components" as const;

type ComponentProp = Record<string, any>;
type FormValues = {
  [COMPONENTS_KEY_NAME]: ComponentProp[];
};

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

export default function useEditorOperations(
  { components: initialComponents, template }: {
    components: PageComponentData[];
    template: string;
  },
) {
  const componentsRef = useRef<PageComponentData[]>();

  if (componentsRef.current === undefined) {
    componentsRef.current = structuredClone(initialComponents);
  }

  const components = componentsRef.current as PageComponentData[];

  const methods = useForm<FormValues>({
    defaultValues: {
      [COMPONENTS_KEY_NAME]: mapComponentsToFormData(components),
    },
  });
  const { fields, swap, remove, append } = useFieldArray({
    control: methods.control,
    name: COMPONENTS_KEY_NAME,
  });

  const onReset = () => {
    componentsRef.current = structuredClone(initialComponents);

    methods.reset({
      [COMPONENTS_KEY_NAME]: mapComponentsToFormData(componentsRef.current),
    });
  };

  const onSubmit = methods.handleSubmit(
    async ({ components: formComponents }) => {
      const newComponents = mapFormDataToComponents(
        formComponents,
        components,
      );

      await fetch("/live/api/editor", {
        method: "POST",
        redirect: "manual",
        body: JSON.stringify({ components: newComponents, template }),
      });
      document.location.reload();
    },
  );

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
    componentsRef.current = components.filter((_, index) =>
      index !== removedIndex
    );

    remove(removedIndex);
  };

  const handleAddComponent = useCallback((componentName: string) => {
    const _components = componentsRef.current as PageComponentData[];
    _components.push({ component: componentName });

    append({});
  }, [componentsRef]);

  return {
    onReset,
    onSubmit,
    handleAddComponent,
    handleRemoveComponent,
    handleChangeOrder,
    componentsRef,
    methods,
    fields,
  };
}
