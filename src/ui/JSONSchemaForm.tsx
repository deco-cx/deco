import type { JSONSchema7, JSONSchema7TypeName } from "json-schema";
import type { FunctionComponent, h } from "preact";
import { useFormContext } from "react-hook-form";
import { forwardRef } from "preact/compat";
import IconButton from "./IconButton.tsx";
import LinkButton from "./LinkButton.tsx";
import CaretDownIcon from "../icons/CaretDownIcon.tsx";

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

interface Props {
  schema: JSONSchema7;
  index: number;
  prefix: string;
  changeOrder: (dir: "prev" | "next", pos: number) => void;
  removeComponents: (removedComponents: number) => void;
  component: string;
}

export default function JSONSchemaForm(
  { schema, index, changeOrder, removeComponents, prefix, component }: Props,
) {
  if (schema.type !== "object") {
    throw new Error("Schema must be type object");
  }

  const handleHover = () => {
    window.location.hash = `#${component}-${index}`;
  };

  return (
    <div class="bg-[#F8F8F8] hover:bg-[#F4F4F4] border border-[#F4F4F4] rounded-l mb-4 transition-colors ease-in">
      <article
        class="cursor-pointer p-3 font-semibold text-xs leading-4 list-none flex justify-between"
        onMouseEnter={handleHover}
      >
        <h3>
          {schema.title}
        </h3>
      </article>
      {/* <RenderFields */}
      {/* required={schema.required} */}
      {/* properties={schema.properties} */}
      {/* prefix={prefix !== undefined ? `${prefix}.` : ""} */}
      {/* /> */}

      {/* <div class="px-4 py-2 border-t-1 border-[#F4F4F4] flex justify-end gap-2"> */}
      {/* <IconButton */}
      {/* onClick={() => { */}
      {/* changeOrder("prev", index); */}
      {/* }} */}
      {/* > */}
      {/* <CaretDownIcon fill="#170DAB" class="rotate-180" /> */}
      {/* </IconButton> */}
      {/* <IconButton */}
      {/* onClick={() => { */}
      {/* changeOrder("next", index); */}
      {/* }} */}
      {/* > */}
      {/* <CaretDownIcon fill="#170DAB" /> */}
      {/* </IconButton> */}
      {/* <LinkButton */}
      {/* onClick={() => { */}
      {/* removeComponents(index); */}
      {/* }} */}
      {/* > */}
      {/* <span class="text-sm text-custom-red">Remover</span> */}
      {/* </LinkButton> */}
      {/* </div> */}
    </div>
  );
}
