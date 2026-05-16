import { assertEquals } from "@std/assert";
import {
  resolveDynamicInvokeProps,
  resolveInvokePath,
} from "../../utils/invoke_path.ts";

Deno.test("resolveInvokePath keeps exact .ts invoke keys", () => {
  const resolved = resolveInvokePath(
    "site/loaders/product/review.ts",
    ["site/loaders/product/review.ts"],
  );

  assertEquals(resolved, {
    key: "site/loaders/product/review.ts",
    dynamicSegments: [],
  });
});

Deno.test("resolveInvokePath accepts extensionless invoke keys", () => {
  const resolved = resolveInvokePath(
    "site/loaders/product/review",
    ["site/loaders/product/review.ts"],
  );

  assertEquals(resolved, {
    key: "site/loaders/product/review.ts",
    dynamicSegments: [],
  });
});

Deno.test("resolveInvokePath extracts suffix segments after extensionless keys", () => {
  const resolved = resolveInvokePath(
    "site/loaders/product/review/SOMEMODEL",
    ["site/loaders/product/review.ts"],
  );

  assertEquals(resolved, {
    key: "site/loaders/product/review.ts",
    dynamicSegments: ["SOMEMODEL"],
  });
});

Deno.test("resolveInvokePath decodes dynamic suffix segments", () => {
  const resolved = resolveInvokePath(
    "site/loaders/product/review/MODEL%20BLUE",
    ["site/loaders/product/review.ts"],
  );

  assertEquals(resolved, {
    key: "site/loaders/product/review.ts",
    dynamicSegments: ["MODEL BLUE"],
  });
});

Deno.test("resolveInvokePath rejects encoded slashes in dynamic suffix segments", () => {
  const resolved = resolveInvokePath(
    "site/loaders/product/review/MODEL%2FBLUE",
    ["site/loaders/product/review.ts"],
  );

  assertEquals(resolved, undefined);
});

Deno.test("resolveInvokePath keeps malformed URI segments unchanged", () => {
  const resolved = resolveInvokePath(
    "site/loaders/product/review/%ZZ",
    ["site/loaders/product/review.ts"],
  );

  assertEquals(resolved, {
    key: "site/loaders/product/review.ts",
    dynamicSegments: ["%ZZ"],
  });
});

Deno.test("resolveDynamicInvokeProps maps path segments to dynamic params", () => {
  const resolved = resolveDynamicInvokeProps(
    "site/loaders/product/review/SOMEMODEL",
    { ignored: "query" },
    {
      loaders: {
        "site/loaders/product/review.ts": {
          dynamicParams: ["model"],
        },
      },
    },
  );

  assertEquals(resolved, {
    key: "site/loaders/product/review.ts",
    props: { ignored: "query", model: "SOMEMODEL" },
  });
});

Deno.test("resolveDynamicInvokeProps rejects suffix segments without dynamic params", () => {
  const resolved = resolveDynamicInvokeProps(
    "site/loaders/product/review/SOMEMODEL",
    { ignored: "query" },
    {
      loaders: {
        "site/loaders/product/review.ts": {},
      },
    },
  );

  assertEquals(resolved, undefined);
});

Deno.test("resolveDynamicInvokeProps lets path params override props", () => {
  const resolved = resolveDynamicInvokeProps(
    "site/loaders/product/review/PATHMODEL",
    { model: "QUERYMODEL" },
    {
      loaders: {
        "site/loaders/product/review.ts": {
          dynamicParams: ["model"],
        },
      },
    },
  );

  assertEquals(resolved, {
    key: "site/loaders/product/review.ts",
    props: { model: "PATHMODEL" },
  });
});
