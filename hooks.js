// @deco/deco/hooks compat for apps/
export const useDevice = () => {
  if (typeof window !== "undefined") {
    const width = window.innerWidth;
    if (width < 768) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  }
  return "desktop";
};
export const useScript = (fn, ...args) => {
  const serializedArgs = args.map((arg) => JSON.stringify(arg)).join(", ");
  return `(${fn.toString()})(${serializedArgs})`;
};
export const useScriptAsDataURI = (fn, ...args) => {
  const script = useScript(fn, ...args);
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(script)}`;
};
export const useSection = (options) => {
  const props = options?.props ? encodeURIComponent(JSON.stringify(options.props)) : "";
  return `/deco/render?props=${props}`;
};
export const usePartialSection = (options) => {
  const href = useSection(options);
  return { href, "f-partial": href };
};
export default { useDevice, useScript, useScriptAsDataURI, useSection, usePartialSection };
