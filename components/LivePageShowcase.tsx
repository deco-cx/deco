import { Head } from "$fresh/runtime.ts";

// Should give you pretty editor syntax and highlight on VSCode
const css = (x: TemplateStringsArray) => x.toString();

const styles = css`
body {
  display: flex;
  flex-direction: column;
  gap: 40px;
  background-color: transparent;
}

body>section {
  border: 1px solid hsl(180, 5%, 70%);
  border-radius: 4px;
  cursor: pointer;
  max-height: 500px;
  overflow: hidden;
  background-color: white;
}

body>section>:not(*:first-child) {
  zoom: 0.75;
}

body>section:hover {
  border-width: 1px;
  filter: drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.15)) drop-shadow(0px 8px 32px rgba(0, 0, 0, 0.1));
}

body>section>* {
  pointer-events: none;
  filter: none;
}
`;

const snippet = () => {
  const register = () => {
    ((document.getRootNode() as HTMLElement).firstElementChild as HTMLElement)
      ?.style?.setProperty(
        "background-color",
        "transparent",
      );

    document.querySelectorAll("body>section").forEach((section, index) => {
      // Treshold to consider a section as rendered. This is important for those
      // sections that render a blank section
      const [descriptor] = section.id.split(".tsx-");
      const segments = descriptor.split("/");
      const label = segments[segments.length - 1];
      const description = segments.slice(0, segments.length - 1);

      const div = document.createElement("div");
      div.innerHTML = `
          <div style="width: 100%; padding: 16px;">
            <h2 style="font-size: 20px; font-weight: 700">${label}</h2>
            <p style="font-size: 15px;">${description.join("/")}</p>
          </div>
        `;

      section.insertBefore(div, section.firstChild);

      section.addEventListener(
        "click",
        () =>
          top?.postMessage(
            { type: "live::selectSession", payload: index },
            "*",
          ),
      );
    });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    document.addEventListener("DOMContentLoaded", register);
  }
};

function LivePageShowcase() {
  return (
    <Head>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <script
        type="text/javascript"
        dangerouslySetInnerHTML={{ __html: `(${snippet})();` }}
      />
    </Head>
  );
}

export default LivePageShowcase;
