import { webcrypto } from "node:crypto";
import crypto from "node:crypto";
import hash, { MD5 } from "https://esm.sh/v135/object-hash@3.0.0";
import { md5, sha1 } from "npm:hash-wasm";

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

Deno.bench("Hashing algo: hash", { group: "object-hash" }, () => {
    for (const test of tests) {
        hash(test);
    }
});

Deno.bench("Hashing algo: MD5", { group: "object-hash" }, () => {
    for (const test of tests) {
        MD5(test);
    }
});

Deno.bench("Hashing algo: hash.MD5", { group: "object-hash" }, () => {
    for (const test of tests) {
        hash.MD5(test);
    }
});

Deno.bench("Hashing algo: crypto.createHash('sha256')", { group: "object-hash" }, () => {
    for (const test of tests) {
        crypto.createHash("sha256").update(JSON.stringify(test)).digest("hex");
    }
});

Deno.bench("Hashing algo: crypto.createHash('md5')", { group: "object-hash" }, () => {
    for (const test of tests) {
        crypto.createHash("md5").update(JSON.stringify(test)).digest("hex");
    }
});

Deno.bench("Hashing algo: webcrypto.subtle.digest('SHA-256'", { group: "object-hash" }, async () => {
    for (const test of tests) {
        const msgUint8 = new TextEncoder().encode(JSON.stringify(test));
        const hashBuffer = await webcrypto.subtle.digest("SHA-256", msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
});

Deno.bench("Hashing algo: hash-wasm md5", { group: "object-hash" }, async () => {
    for (const test of tests) {
        await md5(JSON.stringify(test));
    }
});

Deno.bench("Hashing algo: hash-wasm sha1", { group: "object-hash" }, async () => {
    for (const test of tests) {
        await sha1(JSON.stringify(test));
    }
});
