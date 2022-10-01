import type {
  JSONSchema7,
  JSONSchema7TypeName,
} from "https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts";
import type { FunctionComponent, h } from "preact";
import { useFormContext } from "react-hook-form";
import { forwardRef } from "preact/compat";
import Button from "./Button.tsx";
import CaretDownIcon from "../icons/CaretDownIcon.tsx";
import TrashIcon from "../icons/TrashIcon.tsx";

const getInputTypeFromFormat = (format: JSONSchema7["format"]) => {
  switch (format) {
    case "date":
      return "date";
    case "date-time":
      return "datetime-local";
    case "email":
      return "email";
    case "iri":
    case "uri":
      return "url";
    case "time":
      return "time";
    default:
      return "";
  }
};

const FieldTypes: Record<
  Exclude<
    JSONSchema7TypeName,
    "object" | "array" | "null"
  >,
  FunctionComponent<h.JSX.HTMLAttributes<HTMLInputElement>>
> = {
  "string": forwardRef((props: h.JSX.HTMLAttributes<HTMLInputElement>, ref) => (
    <input
      {...props}
      ref={ref}
      class={`transition-colors ease-in rounded-xl shadow p-2 mb-2 w-full ${
        props.class ?? ""
      }`}
    />
  )),
  "number": forwardRef((props: h.JSX.HTMLAttributes<HTMLInputElement>, ref) => (
    <input
      {...props}
      type="number"
      ref={ref}
      class={`transition-colors ease-in rounded-xl p-2 mb-2 w-full ${
        props.class ?? ""
      }`}
    />
  )),
  "integer": forwardRef((
    props: h.JSX.HTMLAttributes<HTMLInputElement>,
    ref,
  ) => (
    <input
      {...props}
      type="number"
      ref={ref}
      class={`transition-colors ease-in rounded-xl p-2 mb-2 w-full ${
        props.class ?? ""
      }`}
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
      class={`transition-colors ease-in w-5 h-5 p-2 mb-2 ${props.class ?? ""}`}
    />
  )),
};

interface RenderFieldProps
  extends Pick<JSONSchema7, "required" | "properties"> {
  prefix: string;
}

function RenderFields(
  { properties: jsonSchemaProperties, prefix, required = [] }: RenderFieldProps,
) {
  const { register } = useFormContext();

  const properties = jsonSchemaProperties
    ? Object.entries(jsonSchemaProperties)
    : [];
  return (
    <>
      {properties.map(([field, property]) => {
        const {
          type,
          title,
          minLength,
          maxLength,
          pattern,
          format,
        } = property as JSONSchema7;
        if (
          Array.isArray(type) || type === undefined || type === "null" ||
          type === "array"
        ) {
          console.log("Type must be a string");
          return null;
        }

        if (type === "object") {
          const { properties: nestedProperties, required: nestedRequired } =
            property as JSONSchema7;
          return (
            <RenderFields
              required={nestedRequired}
              properties={nestedProperties}
              prefix={`${prefix}${field}.`}
            />
          );
        }

        const fullPathField = `${prefix}${field}`;
        const Field = FieldTypes[type];
        const inputType = getInputTypeFromFormat(format);
        const isFieldRequired = required.includes(field);

        return (
          <div class="flex flex-col items-start">
            <label class="text-sm pb-1" htmlFor={fullPathField}>
              {title}
            </label>
            <Field
              type={inputType}
              pattern={pattern}
              required={isFieldRequired}
              {...register(fullPathField, {
                minLength,
                maxLength,
                pattern: pattern ? new RegExp(pattern) : undefined,
                required: isFieldRequired,
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
  index: number;
  prefix: string;
  changeOrder: (dir: "prev" | "next", pos: number) => void;
  removeComponents: (removedComponents: number) => void;
}

export default function JSONSchemaForm(
  { schema, index, changeOrder, removeComponents, prefix }: Props,
) {
  if (schema.type !== "object") {
    throw new Error("Schema must be type object");
  }

  return (
    <div class="bg-primary-light rounded-xl shadow-md mb-2 py-2 px-4">
      <div class="mb-4 flex justify-between items-center">
        <legend class="font-bold text-md">{schema.title}</legend>
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
      </div>
      <RenderFields
        required={schema.required}
        properties={schema.properties}
        prefix={prefix !== undefined ? `${prefix}.` : ""}
      />
    </div>
  );
}
