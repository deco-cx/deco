/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useState } from "preact/hooks";
import { useEditor } from "$live/src/EditorProvider.tsx";
import { tw } from "twind";

function deepClone(value: Record<any, any>) {
  // Find a faster approach
  return JSON.parse(JSON.stringify(value));
}

// set nested value in place
function setValue(target: Record<string, any>, path: string, value: any) {
  const pathList = path.split(".");
  let localValue = target;
  const lastIdx = pathList.length - 1;

  pathList.forEach((key, idx) => {
    if (idx === lastIdx) {
      localValue[key] = value;
      return;
    }

    localValue = localValue[key];
  });

  return { ...target };
}

function TrashIcon(
  { class: className, width = 16, height = 16 }: h.JSX.SVGAttributes<
    SVGElement
  >,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      class={className}
      fill="#000000"
      viewBox="0 0 256 256"
    >
      <rect width="256" height="256" fill="none"></rect>
      <line
        x1="216"
        y1="56"
        x2="40"
        y2="56"
        fill="none"
        stroke="#000000"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
      <line
        x1="104"
        y1="104"
        x2="104"
        y2="168"
        fill="none"
        stroke="#000000"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
      <line
        x1="152"
        y1="104"
        x2="152"
        y2="168"
        fill="none"
        stroke="#000000"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </line>
      <path
        d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56"
        fill="none"
        stroke="#000000"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
      <path
        d="M168,56V40a16,16,0,0,0-16-16H104A16,16,0,0,0,88,40V56"
        fill="none"
        stroke="#000000"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </path>
    </svg>
  );
}

function CaretDownIcon(
  { class: className, width = 16, height = 16 }: h.JSX.SVGAttributes<
    SVGElement
  >,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="#000000"
      width={width}
      height={height}
      viewBox="0 0 256 256"
      class={className}
    >
      <rect width="256" height="256" fill="none"></rect>
      <polyline
        points="208 96 128 176 48 96"
        fill="none"
        stroke="#000000"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="16"
      >
      </polyline>
    </svg>
  );
}

interface InputProps extends h.JSX.HTMLAttributes<HTMLInputElement> {
  prop: string;
}

function PropInput({ prop, ...props }: InputProps) {
  return (
    <>
      <label for={prop}>{prop}</label>
      <input
        {...props}
        class={tw`border rounded p-1 w-full ${props.class}`}
      />
    </>
  );
}

function ActionButton(props: h.JSX.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      class={tw`border py-1 px-2 rounded transition-colors ease-in ${
        !props.disabled ? "hover:bg-gray-100" : ""
      } ${props.class}`}
    />
  );
}

// propPrefix is used for nested values
function PropsInputs({ props, propPrefix, onChange }) {
  return (
    <>
      {Object.entries(props).map(([prop, value]) => {
        if (typeof value === "object") {
          return (
            <PropsInputs
              props={value}
              propPrefix={`${propPrefix}${prop}.`}
              onChange={onChange}
            />
          );
        }

        const defaultProps: InputProps = {
          prop,
          id: prop,
          name: prop,
          value: props[prop],
          onChange: (e) => onChange(e.target?.value, propPrefix.concat(prop)),
        };
        let customProps: InputProps = {} as InputProps;

        if (typeof value === "boolean") {
          customProps = {
            ...customProps,
            type: "checkbox",
            onChange: () => onChange(!value, propPrefix.concat(prop)),
          };
        }

        return (
          <PropInput
            {...defaultProps}
            {...customProps}
            class={tw`last:mb-2`}
          />
        );
      })}
    </>
  );
}

function NewComponentForm({ componentSchema, componentName, handleSubmit }) {
  const { addComponents } = useEditor();
  const [props, setProps] = useState(
    deepClone(componentSchema || {}),
  );

  const handleChange = (value: any, path: string) => {
    setProps((oldProps) => setValue(oldProps, path, value));
  };

  return (
    <div class={componentSchema ? tw`rounded-md border mt-2 p-2` : "mt-2"}>
      {componentSchema
        ? (
          <form class={tw`flex flex-col items-start`}>
            {/* TODO: improve performance related to setState.*/}
            <PropsInputs props={props} propPrefix="" onChange={handleChange} />
          </form>
        )
        : null}
      <ActionButton
        type="button"
        onClick={() => {
          addComponents([{
            component: componentName,
            props: componentSchema ? props : undefined,
          }]);
          handleSubmit();
        }}
      >
        Adicionar componente
      </ActionButton>
    </div>
  );
}

function AddNewComponent() {
  const { projectComponents } = useEditor();
  const [selectedComponent, setSelectedComponent] = useState("");

  return (
    <div>
      Selecione componente para adicionar
      <select
        class={tw`border rounded px-2 py-1`}
        value={selectedComponent}
        onChange={(e) => setSelectedComponent(e.currentTarget.value)}
      >
        {Object.keys(projectComponents).map((componentName) => (
          <option value={componentName}>{componentName}</option>
        ))}
      </select>
      {selectedComponent && (
        <NewComponentForm
          key={selectedComponent}
          componentSchema={projectComponents[selectedComponent]}
          componentName={selectedComponent}
          handleSubmit={() => setSelectedComponent("")}
        />
      )}
    </div>
  );
}

export default function EditorSidebar() {
  const {
    components,
    updateComponentProp,
    template,
    changeOrder,
    removeComponents,
  } = useEditor();

  const saveProps = async () => {
    await fetch("/live/api/editor", {
      method: "POST",
      redirect: "manual",
      body: JSON.stringify({ components, template }),
    });
    document.location.reload();
  };

  return (
    <div class="w-3/12 border-l-2 p-2">
      <header>
        <h2 class="font-bold text-lg">Editor</h2>
      </header>
      <div class="mt-4">
        <form id="editor-sidebar" onSubmit={(e) => e.preventDefault()}>
          {components.map(({ component, props }, index) => {
            const isFirst = index === 0;
            const isLast = index === components.length - 1;
            return (
              <div class="rounded-md border mb-2 p-2">
                <fieldset key={Math.random()}>
                  <div
                    class={tw`flex justify-between items-center ${
                      props ? "mb-2" : ""
                    }`}
                  >
                    <legend class="font-bold">{component}</legend>
                    <div class="flex justify-end gap-2">
                      <ActionButton
                        disabled={isLast}
                        onClick={!isLast
                          ? () => {
                            changeOrder("next", index);
                          }
                          : undefined}
                      >
                        <CaretDownIcon />
                      </ActionButton>
                      <ActionButton
                        disabled={isFirst}
                        onClick={!isFirst
                          ? () => {
                            changeOrder("prev", index);
                          }
                          : undefined}
                      >
                        <CaretDownIcon class="rotate-180" />
                      </ActionButton>
                      <ActionButton
                        onClick={() => removeComponents([index])}
                      >
                        <TrashIcon />
                      </ActionButton>
                    </div>
                  </div>

                  {/* TODO: handle nested values */}
                  {props && Object.entries(props).map(([prop, value], idx) => {
                    const inputId = `${idx}_${component}`;
                    return (
                      <PropInput
                        prop={prop}
                        id={inputId}
                        value={value}
                        onChange={(e) =>
                          updateComponentProp({
                            index,
                            prop,
                            value: e.currentTarget.value,
                          })}
                      />
                    );
                  })}
                </fieldset>
              </div>
            );
          })}
          <div class="py-1">
            <AddNewComponent />
          </div>
          <br />
          <ActionButton type="button" onClick={saveProps}>
            Salvar
          </ActionButton>
        </form>
      </div>
    </div>
  );
}
