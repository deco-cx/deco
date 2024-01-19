import hash from "https://esm.sh/v135/object-hash@3.0.0";

const props = {
  randomObject: {
    foo: "bar",
    baz: 42,
  },
  randomNestedObject: {
    foo: "bar",
    baz: {
      foo: {
        bar: "baz",
      },
    },
  },
  randomArray: [1, 2, 3, 4, 5],
  randomNestedArray: [1, 2, 3, [4, 5]],
  randomString: "Hello World",
  randomNumber: 42,
  randomBoolean: true,
};

const smallString = "Hello World";
const largeString = "Hello World".repeat(1000);

const tests = [props];

Deno.bench("hash", { group: "object-hash" }, () => {
  for (const test of tests) {
    hash(test);
  }
});

Deno.bench("hash with options", { group: "object-hash" }, () => {
  for (const test of tests) {
    hash(test, {
      ignoreUnknown: true,
      respectType: false,
      respectFunctionProperties: false,
    });
  }
});

Deno.bench("hash MD5 with options", { group: "object-hash" }, () => {
  for (const test of tests) {
    hash(test, {
      ignoreUnknown: true,
      respectType: false,
      respectFunctionProperties: false,
      algorithm: "md5",
    });
  }
});

Deno.bench("hash.MD5", { group: "object-hash" }, () => {
  for (const test of tests) {
    hash.MD5(test);
  }
});
