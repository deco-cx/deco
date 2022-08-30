export function deepClone(value: Record<any, any>) {
  // Find a faster approach
  return JSON.parse(JSON.stringify(value));
}

// set nested value in place
export function setValue(
  target: Record<string, any>,
  path: string,
  value: any,
) {
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

export function mergePropsOnSchema(schema: Record<any, any>, props) {
  return Object.keys(schema).reduce(
    (merged, key) => {
      merged[key] = props[key] ?? schema[key];
      return merged;
    },
    {} as Record<string, any>,
  );
}
