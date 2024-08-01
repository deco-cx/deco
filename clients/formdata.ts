function escapeDots(key: string): string {
  return key.replace(/\./g, "\\.");
}

function unescapeDots(key: string): string {
  return key.replaceAll(/\\\./g, ".");
}

export function propsToFormData(props: unknown): FormData {
  if (props instanceof FormData) {
    return props;
  }

  const formData = new FormData();

  const appendToFormData = (
    _key: string,
    value: unknown,
    ignoreEscaping?: boolean,
  ) => {
    const key = ignoreEscaping ? _key : escapeDots(_key);
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          for (const [_nestedKey, nestedValue] of Object.entries(item)) {
            const nestedKey = escapeDots(_nestedKey);
            if (nestedValue instanceof Blob) {
              formData.append(`${key}.${index}.${nestedKey}`, nestedValue);
            } else {
              formData.append(
                `${key}.${index}.${nestedKey}`,
                String(nestedValue),
              );
            }
          }
        } else {
          if (item instanceof Blob) {
            formData.append(`${key}.${index}`, item);
          } else {
            formData.append(`${key}.${index}`, String(item));
          }
        }
      });
    } else if (value instanceof Blob) {
      formData.append(key, value);
    } else if (typeof value === "object" && value !== null) {
      for (const [_nestedKey, nestedValue] of Object.entries(value)) {
        const nestedKey = escapeDots(_nestedKey);
        appendToFormData(`${key}.${nestedKey}`, nestedValue, true);
      }
    } else {
      formData.append(key, String(value));
    }
  };

  if (Array.isArray(props)) {
    throw new Error("Cannot send array as multipart");
  } else {
    for (const [key, value] of Object.entries(props as object)) {
      appendToFormData(key, value);
    }
  }

  return formData;
}

export function formDataToProps(formData: FormData): Record<string, any> {
  const props: Record<string, any> = {};

  formData.forEach((value, key) => {
    const keys = key.split(/(?<!\\)\./).map(unescapeDots);
    let current = props;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        if (isFinite(Number(keys[i + 1]))) {
          current[keys[i]] = [];
        } else {
          current[keys[i]] = {};
        }
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value instanceof Blob
      ? value
      : String(value);
  });

  return props;
}
