// implement in typescript groupObjectBy function using reduce, which traverses an object and return a new object where the keys are the return of the function and the values are the keys of the original object that return the same value.
// example: groupBy({a: "b", c: "d", f: "b"}, (i) => i) // {b: ['a', 'f'], d: ['c']}

export const groupObjectBy = (obj: object, fn: Function) => {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const group = fn(value);
    return {
      ...acc,
      [group]: [...(acc[group] || []), key],
    };
  }, {});
};
