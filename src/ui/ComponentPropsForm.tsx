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
        class={`rounded border border-[#DADADA] text-sm p-2 w-full ${
          props.class ?? ""
        }  placeholder-shown:sibling:(top-1/2 -translate-y-1/2 scale-100) focus:sibling:(top-[0.35rem] left-1 -translate-y-4 scale-75)`}
        placeholder=" "
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
          <div class="relative items-start mb-3">
            <Field
              id={fullPathField}
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
            <label
              htmlFor={fullPathField}
              class="text-sm text-[#787878] tracking-wider bg-white px-2 z-10 absolute top-[0.35rem] left-1 -translate-y-4 scale-75 origin-[0] transform duration-300"
            >
              {title}
            </label>
          </div>
        );
      })}
    </>
  );
}
