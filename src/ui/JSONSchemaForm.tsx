import type { JSONSchema7, JSONSchema7TypeName } from "json-schema";
import { FunctionComponent, h, options } from "preact";
import { useFormContext } from "react-hook-form";
import { forwardRef, useRef } from "preact/compat";
import IconButton from "./IconButton.tsx";
import LinkButton from "./LinkButton.tsx";
import DotsThreeIcon from "../icons/DotsThreeIcon.tsx";
import TrashIcon from "../icons/TrashIcon.tsx";
import { useSignal } from "@preact/signals";
import Modal from "./Modal.tsx";
import { tw } from "twind";

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
  const openOptions = useSignal(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (schema.type !== "object") {
    throw new Error("Schema must be type object");
  }

  const handleHover = () => {
    window.location.hash = `#${component}-${index}`;
  };

  const getOptionsStyle = () => {
    if (!buttonRef.current) return;

    // forwardedRef set the DOM node to ref.current.base
    const { right, top, height } = buttonRef
      .current.getBoundingClientRect();
    console.log(buttonRef
      .current.getBoundingClientRect());
    // 112 = 7rem = ModalContent width
    const style = { top: top + height + 5, left: right - 112 };

    return style;
  };

  return (
    <div class="bg-[#F8F8F8] hover:bg-[#F4F4F4] border border-[#F4F4F4] rounded-l mb-4 transition-colors ease-in">
      <article
        class="cursor-pointer p-3 font-semibold text-xs leading-4 list-none flex justify-between items-center"
        onMouseEnter={handleHover}
        onClick={() => (openOptions.value = true)}
      >
        <h3>
          {schema.title}
        </h3>
        <IconButton ref={buttonRef}>
          <DotsThreeIcon />
        </IconButton>
      </article>

      <Modal
        open={openOptions.value}
        style={getOptionsStyle()}
        class="absolute z-10 bg-white rounded-lg p-2 border w-28"
        modalProps={{
          class:
            tw`bg-transparente fixed inset-0 z-50 flex justify-center items-center`,
        }}
        onDismiss={() => openOptions.value = false}
      >
        <menu class="list-none m-0 p-0">
          <LinkButton
            class="flex gap-2 text-xs w-full"
            onClick={() => {
              removeComponents(index);
              openOptions.value = false;
            }}
          >
            <TrashIcon fill="black" /> <span>Remover</span>
          </LinkButton>
        </menu>
      </Modal>

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
