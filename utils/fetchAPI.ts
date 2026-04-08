export const fetchAPI = async <T>(
  input: string | Request,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });

  if (response.ok) {
    return response.json();
  }

  const errorBody = await response.text();
  console.error(
    `fetchAPI error ${response.status} ${response.statusText} - ${input}`,
    errorBody,
  );
  throw new Error(`fetch ${input} responded with status ${response.status}`);
};
