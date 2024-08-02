import { assertEquals, assertThrows } from "jsr:@std/assert";
import { formDataToProps, propsToFormData } from "./formdata.ts";

const EXAMPLE_FILE = new File(["foo"], "foo.txt");
const EXAMPLE_OBJECT = {
  foo: {
    bar: "baz",
    qux: "123",
    quux: "true",
  },
  myFile: EXAMPLE_FILE,
  baz: [
    {
      qux: "quux",
      quuz: "123",
      corge: "true",
    },
    {
      qux: "quux",
      quuz: "123",
      corge: "true",
    },
    "qux",
  ],
};

Deno.test("propsToFormData", async (t) => {
  await t.step("primitive values work", () => {
    const formData = propsToFormData({
      foo: "bar",
      baz: 123,
      qux: true,
    });

    assertEquals(formData.get("foo"), "bar");
    assertEquals(formData.get("baz"), "123");
    assertEquals(formData.get("qux"), "true");
  });

  await t.step("nested objects work", () => {
    const formData = propsToFormData(EXAMPLE_OBJECT);

    assertEquals(formData.get("foo.bar"), "baz");
    assertEquals(formData.get("foo.qux"), "123");
    assertEquals(formData.get("foo.quux"), "true");
    assertEquals(formData.get("baz.0.qux"), "quux");
    assertEquals(formData.get("baz.0.quuz"), "123");
    assertEquals(formData.get("baz.0.corge"), "true");
    assertEquals(formData.get("baz.1.qux"), "quux");
    assertEquals(formData.get("baz.1.quuz"), "123");
    assertEquals(formData.get("baz.1.corge"), "true");
    assertEquals(formData.get("baz.2"), "qux");
    assertEquals(formData.get("myFile"), EXAMPLE_FILE);
  });

  await t.step("root as array throws", () => {
    assertThrows(
      () => {
        propsToFormData([1, 2, 3]);
      },
      Error,
      "Cannot send array as multipart",
    );
  });

  await t.step("dots in keys work", () => {
    const formData = propsToFormData({
      "foo.bar": "baz",
    });

    assertEquals(formData.get("foo\\.bar"), "baz");
  });
});

Deno.test("formDataToProps", async (t) => {
  await t.step("primitive values work", () => {
    const formData = new FormData();
    formData.append("foo", "bar");
    formData.append("baz", "123");
    formData.append("qux", "true");

    const props = formDataToProps(formData);

    assertEquals(props, {
      foo: "bar",
      baz: "123",
      qux: "true",
    });
  });

  await t.step("nested objects work", () => {
    const formData = new FormData();
    formData.append("foo.bar", "baz");
    formData.append("foo.qux", "123");
    formData.append("foo.quux", "true");
    formData.append("baz.0.qux", "quux");
    formData.append("baz.0.quuz", "123");
    formData.append("baz.0.corge", "true");
    formData.append("baz.1.qux", "quux");
    formData.append("baz.1.quuz", "123");
    formData.append("baz.1.corge", "true");
    formData.append("baz.2", "qux");
    formData.append("myFile", EXAMPLE_FILE);

    const props = formDataToProps(formData);

    assertEquals(props, EXAMPLE_OBJECT);
  });

  await t.step("reversing using the functions directly", () => {
    const props = formDataToProps(propsToFormData(EXAMPLE_OBJECT));

    assertEquals(props, EXAMPLE_OBJECT);
  });

  await t.step("dots in keys work", () => {
    const formData = new FormData();
    formData.append("foo\\.bar", "baz");

    const props = formDataToProps(formData);

    assertEquals(props, {
      "foo.bar": "baz",
    });
  });
});
