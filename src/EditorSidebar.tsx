/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useEditor } from "./EditorProvider.tsx";

export default function EditorSidebar() {
  const { components, updateComponentProp, template } = useEditor();

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
          {components.map(({ component, id, props }, index) => {
            return props && (
              <fieldset>
                <legend>{component}{"  "}Props</legend>
                {Object.entries(props).map(([prop, value], idx) => {
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
