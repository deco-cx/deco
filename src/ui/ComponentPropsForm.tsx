import type { JSONSchema7, JSONSchema7TypeName } from "json-schema";
import { FunctionComponent, h } from "preact";
import { useFormContext } from "react-hook-form";
import { forwardRef } from "preact/compat";

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

interface Props extends Pick<JSONSchema7, "required" | "properties"> {
  prefix: string;
}

export default function ComponentPropsForm(
  { properties: jsonSchemaProperties, prefix, required = [] }: Props,
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
          $ref,
        } = property as JSONSchema7;
        if (
          Array.isArray(type) || type === undefined || type === "null" ||
          type === "array"
        ) {
          if (type && !$ref) {
            console.log("Invalid type: ", type);
          }

          return null;
        }

        if (type === "object") {
          const { properties: nestedProperties, required: nestedRequired } =
            property as JSONSchema7;
          return (
            <ComponentPropsForm
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
          <label class="flex flex-col items-start mb-2">
            <div class="text-sm pb-1" htmlFor={fullPathField}>
              {title}
            </div>
            <Field
              type={inputType}
              pattern={pattern}
              required={isFieldRequired}
              class="text-sm rounded-sm"
              {...register(fullPathField, {
                minLength,
                maxLength,
                pattern: pattern ? new RegExp(pattern) : undefined,
                required: isFieldRequired,
              })}
            />
          </label>
        );
      })}
    </>
  );
}
