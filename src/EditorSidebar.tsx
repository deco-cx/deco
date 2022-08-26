/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useState } from "preact/hooks";
import { useEditor } from "$live/src/EditorProvider.tsx";
import { tw } from "twind";

function ComponentForm({ componentSchema, componentName, handleSubmit }) {
  const { addComponents } = useEditor();
  const [props, setProps] = useState({ ...(componentSchema || {}) });

  return (
    <div>
      {componentSchema
        ? (
          <form class={tw`flex flex-col`}>
            {/* This is not performatic due to set state */}
            {Object.entries(componentSchema).map(([prop, value]) => {
              if (typeof value === "boolean") {
                return (
                  <>
                    <label for={prop}>{prop}</label>
                    <input
                      id={prop}
                      name={prop}
                      value={props[prop]}
                      class="block border"
                      onChange={() =>
                        setProps((oldProps) => ({
                          ...oldProps,
                          [prop]: !value,
                        }))}
                    />
                  </>
                );
              }

              return (
                <>
                  <label for={prop}>{prop}</label>
                  <input
                    id={prop}
                    name={prop}
                    class="block border"
                    value={props[prop]}
                    onChange={(e) =>
                      setProps((oldProps) => ({
                        ...oldProps,
                        [prop]: e.target?.value,
                      }))}
                  />
                </>
              );
            })}
          </form>
        )
        : null}
      <button
        type="button"
        class={tw`border px-2 py-1`}
        onClick={() => {
          addComponents([{
            component: componentName,
            props: componentSchema ? props : undefined,
          }]);
          handleSubmit();
        }}
      >
        Adicionar componente
      </button>
    </div>
  );
}

function AddNewComponent() {
  const { projectComponents } = useEditor();
  const [selectedComponent, setSelectedComponent] = useState("");

  return (
    <div>
      Selectione componente para adicionar
      <select
        class={tw`border px-2 py-1`}
        value={selectedComponent}
        onChange={(e) => setSelectedComponent(e.currentTarget.value)}
      >
        {Object.keys(projectComponents).map((componentName) => (
          <option value={componentName}>{componentName}</option>
        ))}
      </select>
      {selectedComponent && (
        <ComponentForm
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
    <div class="w-3/12 border-l-2">
      <header class="border-b">
        <h2>Editor</h2>
      </header>
      <div>
        <form id="editor-form" onSubmit={(e) => e.preventDefault()}>
          {components.map(({ component, props }, index) => {
            const isFirst = index === 0;
            const isLast = index === components.length - 1;
            return (
              <fieldset class="border-b py-1" key={Math.random()}>
                <legend>{component}</legend>
                {props && Object.entries(props).map(([prop, value], idx) => {
                  const inputId = `${idx}_${component}`;
                  return (
                    <div class="px-4">
                      <label class="block" for={inputId}>
                        {prop}
                      </label>
                      <input
                        id={inputId}
                        value={value}
                        class="block border"
                        onChange={(e) =>
                          updateComponentProp({
                            index,
                            prop,
                            value: e.currentTarget.value,
                          })}
                      />
                    </div>
                  );
                })}

                <div class="flex justify-end gap-2 mt-1 px-2">
                  <button
                    class="bg-gray-200 px-1"
                    disabled={isLast}
                    onClick={!isLast
                      ? () => changeOrder("next", index)
                      : undefined}
                  >
                    ↓
                  </button>
                  <button
                    class="bg-gray-200 px-1"
                    disabled={isFirst}
                    onClick={!isFirst
                      ? () => changeOrder("prev", index)
                      : undefined}
                  >
                    ↑
                  </button>
                  <button
                    class="bg-gray-200 px-1"
                    onClick={() => removeComponents([index])}
                  >
                    remover
                  </button>
                </div>
              </fieldset>
            );
          })}
          <div class="py-1 px-2 ">
            <AddNewComponent />
          </div>
          <br />
          <button type="button" class="border px-2 py-1" onClick={saveProps}>
            Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
