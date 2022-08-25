/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useEditor } from "./EditorProvider.tsx";

export default function EditorSidebar() {
  const { components, updateComponentProp, template, changeOrder } =
    useEditor();

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
                </div>
              </fieldset>
            );
          })}
          <br />
          <button type="button" class="border px-2 py-1" onClick={saveProps}>
            Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
