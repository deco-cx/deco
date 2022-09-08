import type {
  JSONSchema7,
  JSONSchema7TypeName,
} from "https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts";
import type { FunctionComponent } from "preact";
import { tw } from "twind";
import { useFormContext } from "react-hook-form";
import { forwardRef } from "preact/compat";
import Button from "./Button.tsx";
import CaretDownIcon from "../icons/CaretDownIcon.tsx";
import TrashIcon from "../icons/TrashIcon.tsx";

const FieldTypes: Record<
  Exclude<
    JSONSchema7TypeName,
    "object" | "integer" | "array" | "null"
  >,
  FunctionComponent
> = {
  "string": forwardRef((props: h.JSX.HTMLAttributes<HTMLInputElement>, ref) => (
    <input
      {...props}
      ref={ref}
      class={tw`border hover:border-black transition-colors ease-in rounded p-1 w-full ${props.class}`}
    />
  )),
  "number": forwardRef((props: h.JSX.HTMLAttributes<HTMLInputElement>, ref) => (
    <input
      {...props}
      type="number"
      ref={ref}
      class={tw`border hover:border-black transition-colors ease-in rounded p-1 w-full ${props.class}`}
    />
  )),
  "boolean": forwardRef((
    props: h.JSX.HTMLAttributes<HTMLInputElement>,
    ref,
  ) => (
    <input
      {...props}
      type="checkbox"
      ref={ref}
      class={tw`border hover:border-black transition-colors ease-in rounded p-1 ${props.class}`}
    />
  )),
};

interface RenderFieldProps {
  properties: JSONSchema7["properties"];
  prefix: string;
}

function RenderFields(
  { properties: jsonSchemaProperties, prefix }: RenderFieldProps,
) {
  const { register } = useFormContext();

  const properties = jsonSchemaProperties
    ? Object.entries(jsonSchemaProperties)
    : [];
  return (
    <>
      {properties.map(([field, property]) => {
        const { type, title, properties: nestedProperties } = property;
        if (Array.isArray(type) || type === undefined) {
          console.log("Type must be a string");
          return null;
        }

        if (type === "object") {
          return (
            <RenderFields
              properties={nestedProperties}
              prefix={`${prefix}${field}.`}
            />
          );
        }

        const fullPathField = `${prefix}${field}`;
        const Field = FieldTypes[type];

        return (
          <div class="flex flex-col items-start">
            <label htmlFor={fullPathField}>
              {title}
            </label>
            <Field
              {...register(fullPathField, {
                value: property.default,
                minLength: property.minLength,
                maxLength: property.maxLength,
                min: property.minimum,
                max: property.maximum,
              })}
            />
          </div>
        );
      })}
    </>
  );
}

interface Props {
  schema: JSONSchema7;
  index?: number;
  changeOrder: (dir: "prev" | "next", pos: number) => void;
  removeComponents: (removedComponents: number) => void;
}

export default function JSONSchemaForm(
  { schema, index, changeOrder, removeComponents }: Props,
) {
  if (schema.type !== "object") {
    throw new Error("Schema must be type object");
  }

  return (
    <div class={tw`rounded-md border mb-2 p-2`}>
      <div
        class={tw`flex justify-between items-center`}
      >
        <legend class={tw`font-bold`}>{schema.title}</legend>

        {index !== undefined &&
          (
            <div class="flex gap-2">
              <Button
                onClick={() => {
                  changeOrder("next", index);
                }}
              >
                <CaretDownIcon />
              </Button>
              <Button
                onClick={() => {
                  changeOrder("prev", index);
                }}
              >
                <CaretDownIcon class="rotate-180" />
              </Button>
              <Button
                onClick={() => {
                  removeComponents(index);
                }}
              >
                <TrashIcon />
              </Button>
            </div>
          )}
      </div>
      <RenderFields
        properties={schema.properties}
        prefix={index !== undefined ? `${index}.` : ""}
      />
    </div>
  );
}
