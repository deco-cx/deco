export const path = (obj: Record<string, any>, path: string) => {
  const pathList = path.split(".").filter(Boolean);
  let result = obj;

  pathList.forEach((key) => {
    if (!result[key]) {
      return result[key];
    }

    result = result[key];
  });

  return result;
};
