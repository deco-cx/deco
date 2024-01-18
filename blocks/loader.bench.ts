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

// Those options are not valid because they are not stable, so the same object could be hashed differently
// Deno.bench("crypto.createHash('sha256')", { group: "object-hash" }, () => {
//     for (const test of tests) {
//         crypto.createHash("sha256").update(JSON.stringify(test)).digest("hex");
//     }
// });

// Deno.bench("crypto.createHash('md5')", { group: "object-hash" }, () => {
//     for (const test of tests) {
//         crypto.createHash("md5").update(JSON.stringify(test)).digest("hex");
//     }
// });

// Deno.bench("webcrypto.subtle.digest('SHA-256'", { group: "object-hash" }, async () => {
//     for (const test of tests) {
//         const msgUint8 = new TextEncoder().encode(JSON.stringify(test));
//         const hashBuffer = await webcrypto.subtle.digest("SHA-256", msgUint8);
//         const hashArray = Array.from(new Uint8Array(hashBuffer));
//         hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
//     }
// });

// Deno.bench("hash-wasm md5", { group: "object-hash" }, async () => {
//     for (const test of tests) {
//         await md5(JSON.stringify(test));
//     }
// });

// Deno.bench("hash-wasm sha1", { group: "object-hash" }, async () => {
//     for (const test of tests) {
//         await sha1(JSON.stringify(test));
//     }
// });
