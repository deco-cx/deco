import { MutableRef, useCallback, useRef } from "preact/hooks";
import { useFieldArray, useForm } from "react-hook-form";
import type { Audience } from "../editor.tsx";
import type { Flag, PageComponentData } from "../types.ts";

const COMPONENTS_KEY_NAME: "components" = "components" as const;

type ComponentProp = Record<string, any>;
type FormValues = {
  [COMPONENTS_KEY_NAME]: ComponentProp[];
  experiment: boolean;
  audience: Audience;
};

function arrayMove(array: any[], from: number, to: number) {
  const res = [...array];
  res.splice(to, 0, res.splice(from, 1)[0]);

  return res;
}

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
  const componentsRef = useRef<PageComponentData[]>() as MutableRef<
    PageComponentData[]
  >;

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
  const { fields, move, remove, append } = useFieldArray({
    control: methods.control,
    name: COMPONENTS_KEY_NAME,
  });

  const onReset = () => {
    componentsRef.current = structuredClone(initialComponents);

    methods.reset({
      [COMPONENTS_KEY_NAME]: mapComponentsToFormData(components),
      experiment: flag ? flag.traffic > 0 : false,
      audience: flag && flag.traffic === 0 ? "draft" : "public",
    });
  };

  const onSubmit = methods.handleSubmit(
    async ({ components: formComponents, audience, experiment }) => {
      const newComponents = mapFormDataToComponents(
        formComponents,
        components,
      );

      const searchParams = new URLSearchParams(window.location.search);
      const variantId = searchParams.get("variantId");

      const { variantId: newvariantId } = await fetch("/live/api/editor", {
        method: "POST",
        redirect: "manual",
        body: JSON.stringify({
          components: newComponents,
          template,
          siteId,
          variantId,
          experiment,
          audience,
        }),
      }).then((res) => res.json());

      const url = new URL(window.location.href);
      url.searchParams.set("variantId", newvariantId);
      document.location.replace(url);
    },
  );

  const handleChangeOrder = (from: number, to: number) => {
    if (from !== to) {
      componentsRef.current = arrayMove(components, from, to);

      move(from, to);
    }
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
