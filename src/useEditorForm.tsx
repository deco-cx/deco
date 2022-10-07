import { useCallback, useRef } from "preact/hooks";
import { useFieldArray, useForm } from "react-hook-form";
import { Flag, PageComponentData } from "../types.ts";

const COMPONENTS_KEY_NAME: "components" = "components" as const;

type ComponentProp = Record<string, any>;
type FormValues = {
  [COMPONENTS_KEY_NAME]: ComponentProp[];
  experiment: boolean;
  audience: "draft" | "public";
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

interface EditorProps {
  components: PageComponentData[];
  template: string;
  siteId: number;
  flag: Flag | null;
}

export default function useEditorOperations(
  { components: initialComponents, template, siteId, flag }: EditorProps,
) {
  const componentsRef = useRef<PageComponentData[]>();

  if (componentsRef.current === undefined) {
    componentsRef.current = structuredClone(initialComponents);
  }

  const components = componentsRef.current as PageComponentData[];
  const methods = useForm<FormValues>({
    defaultValues: {
      [COMPONENTS_KEY_NAME]: mapComponentsToFormData(components),
      experiment: flag ? flag.traffic > 0 : false,
      audience: flag && flag.traffic === 0 ? "draft" : "public",
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
      experiment: flag ? flag.traffic > 0 : false,
      audience: flag && flag.traffic === 0 ? "draft" : "public",
    });
  };

  const onSubmit = methods.handleSubmit(
    async ({ components: formComponents }) => {
      const newComponents = mapFormDataToComponents(
        formComponents,
        components,
      );

      const searchParams = new URLSearchParams(window.location.search);
      const variantId = searchParams.get("variantId");

      const experiment = methods.getValues("experiment");

      const { variantId: newvariantId } = await fetch("/live/api/editor", {
        method: "POST",
        redirect: "manual",
        body: JSON.stringify({
          components: newComponents,
          template,
          siteId,
          variantId,
          experiment,
        }),
      }).then((res) => res.json());

      const url = new URL(window.location.href);
      url.searchParams.set("variantId", newvariantId);
      document.location.replace(url);
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
