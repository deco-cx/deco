import { assertArrayIncludes, assertEquals } from "std/testing/asserts.ts";
import { pickPaths } from "../utils/object.ts";

Deno.test("pickpaths", async (t) => {
  const testObj = {
    a: {
      b: {
        c: 1,
        h: "b",
      },
      d: "a",
    },
    k: {
      y: [{ z: 2 }, { t: 3, z: 3 }],
    },
  };
  await t.step("should pick nested paths", () => {
    const result = pickPaths(testObj, ["a.b.c" as const]);
    assertArrayIncludes(
      Object.keys(result),
      ["a"],
      'object keys should include "a"',
    );
    assertEquals(
      Object.keys(result).length,
      1,
      "object keys should have length 1",
    );
    assertArrayIncludes(
      Object.keys(result.a),
      ["b"],
      'keys of object["a"] should include "b"',
    );
    assertEquals(
      Object.keys(result.a).length,
      1,
      'keys of object["a"] should have length 1',
    );
    assertArrayIncludes(
      Object.keys(result.a.b),
      ["c"],
      'keys of object["a"]["b"] should include "c"',
    );
    assertEquals(
      Object.keys(result.a.b).length,
      1,
      'keys of object["a"]["b"] should have length 1',
    );
  });

  await t.step("should pick multiple", () => {
    const result = pickPaths(testObj, ["a.b.c" as const, "k.y.z" as const]);
    assertEquals(result.a.b.c, testObj.a.b.c);
    assertEquals((result.a.b as Record<string, unknown>).h, undefined);
    assertArrayIncludes(result.k.y, [{ z: 2 }, { z: 3 }]);
  });

  await t.step("should pick array", () => {
    type OtherObj = (typeof testObj)[];
    const arrTest: OtherObj = [testObj, testObj];
    const [result, result2] = pickPaths(arrTest, [
      "a.b.c" as const,
      "k.y.z" as const,
    ]);
    assertEquals(result.a.b.c, testObj.a.b.c);
    assertEquals((result.a.b as Record<string, unknown>).h, undefined);
    assertArrayIncludes(result.k.y, [{ z: 2 }, { z: 3 }]);
    assertEquals(result2.a.b.c, testObj.a.b.c);
    assertEquals((result2.a.b as Record<string, unknown>).h, undefined);
    assertArrayIncludes(result2.k.y, [{ z: 2 }, { z: 3 }]);
  });
});
