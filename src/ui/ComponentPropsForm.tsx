import type { JSONSchema7, JSONSchema7TypeName } from "json-schema";
import type { FunctionComponent, h, Ref } from "preact";
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

const BaseInput = forwardRef(
  function BaseInput(
    props: h.JSX.HTMLAttributes<HTMLInputElement>,
    ref: Ref<HTMLInputElement>,
  ) {
    return (
      <input
        {...props}
        ref={ref}
        class={`rounded-sm text-sm shadow p-2 mb-2 w-full ${props.class ?? ""}`}
      />
    );
  },
);

const FieldTypes: Record<
  Exclude<
    JSONSchema7TypeName,
    "object" | "array" | "null"
  >,
  FunctionComponent<h.JSX.HTMLAttributes<HTMLInputElement>>
> = {
  "string": forwardRef((props: h.JSX.HTMLAttributes<HTMLInputElement>, ref) => (
    <BaseInput {...props} ref={ref} type="text" />
  )),
  "number": forwardRef((props: h.JSX.HTMLAttributes<HTMLInputElement>, ref) => (
    <BaseInput {...props} ref={ref} type="number" />
  )),
  "integer": forwardRef((
    props: h.JSX.HTMLAttributes<HTMLInputElement>,
    ref,
  ) => <BaseInput {...props} ref={ref} type="number" />),
  "boolean": forwardRef((
    props: h.JSX.HTMLAttributes<HTMLInputElement>,
    ref,
  ) => <BaseInput {...props} ref={ref} type="checkbox" />),
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
          <div class="flex flex-col items-start mb-3">
            <label
              htmlFor={fullPathField}
              class="text-sm pb-1"
            >
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
