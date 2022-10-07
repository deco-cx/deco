const handleKeyDownFunction = (function handleKeyDown(event) {
  if (
    event.ctrlKey && event.shiftKey && event.key === "E"
  ) {
    const url = new URL(window.location);
    if (url.searchParams.has("editor")) {
      url.searchParams.delete("editor");
    } else {
      url.searchParams.append("editor", "");
    }

    window.location = url.toString();
  }

  if (
    event.key === "Escape"
  ) {
    window.location = "/admin";
  }
}).toString();

export default function EditorListener() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          `document.body.addEventListener("keydown", ${handleKeyDownFunction})`,
      }}
    >
    </script>
  );
}
