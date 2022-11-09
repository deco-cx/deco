import { assertEquals } from "https://deno.land/std@0.163.0/testing/asserts.ts";
import { JSONSchema7 } from "https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts";
import { getInputSchemaFromDocs } from "./denoDoc.ts";

Deno.test("should generate inputSchema with primitive props", () => {
  const denoDocOutputPrimitiveTypes =
    '[{"kind":"interface","name":"Props","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":4,"col":0},"declarationKind":"export","interfaceDef":{"extends":[],"methods":[],"properties":[{"name":"imgSrc","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":5,"col":2},"params":[],"computed":false,"optional":false,"tsType":{"repr":"","kind":"typeLiteral","typeLiteral":{"methods":[],"properties":[{"name":"mobile","params":[],"computed":false,"optional":false,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"desktop","params":[],"computed":false,"optional":false,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]}],"callSignatures":[],"indexSignatures":[]}},"typeParams":[]},{"name":"alt","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":6,"col":2},"params":[],"computed":false,"optional":true,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"textColor","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":7,"col":2},"params":[],"computed":false,"optional":true,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"text","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":8,"col":2},"params":[],"computed":false,"optional":true,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"title","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":9,"col":2},"params":[],"computed":false,"optional":true,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"subtitle","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":10,"col":2},"params":[],"computed":false,"optional":true,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"link","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":11,"col":2},"params":[],"computed":false,"optional":true,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"CTA","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":12,"col":2},"params":[],"computed":false,"optional":true,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]}],"callSignatures":[],"indexSignatures":[],"typeParams":[]}},{"kind":"function","name":"default","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":22,"col":0},"declarationKind":"export","functionDef":{"params":[{"kind":"object","props":[{"kind":"assign","key":"imgSrc","value":"[UNSUPPORTED]"},{"kind":"assign","key":"alt","value":null},{"kind":"assign","key":"text","value":null},{"kind":"assign","key":"title","value":null},{"kind":"assign","key":"subtitle","value":null},{"kind":"assign","key":"link","value":null},{"kind":"assign","key":"CTA","value":null},{"kind":"assign","key":"textColor","value":null}],"optional":false,"tsType":{"repr":"Props","kind":"typeRef","typeRef":{"typeParams":null,"typeName":"Props"}}}],"returnType":null,"hasBody":true,"isAsync":false,"isGenerator":false,"typeParams":[]}},{"kind":"import","name":"JSONSchema7","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":1,"col":0},"declarationKind":"private","importDef":{"src":"https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts","imported":"JSONSchema7"}},{"kind":"import","name":"Image","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/BannerImg.tsx","line":2,"col":0},"declarationKind":"private","importDef":{"src":"file:///Users/lucis/deco/zeedog/components/ui/Image.tsx","imported":"default"}}]';

  const generatedSchema = getInputSchemaFromDocs(
    JSON.parse(denoDocOutputPrimitiveTypes)
  );

  const expectedSchema = {
    title: "BannerImg",
    type: "object",
    properties: {
      imgSrc: {
        title: "Img Src",
        type: "object",
        properties: {
          mobile: { title: "Mobile", type: "string" },
          desktop: { title: "Desktop", type: "string" },
        },
      },
      alt: { title: "Alt", type: "string" },
      textColor: { title: "Text Color", type: "string" },
      text: { title: "Text", type: "string" },
      title: { title: "Title", type: "string" },
      subtitle: { title: "Subtitle", type: "string" },
      link: { title: "Link", type: "string" },
      CTA: { title: " C T A", type: "string" },
    },
  } as JSONSchema7;
  assertEquals(generatedSchema, expectedSchema);
});

Deno.test(
  "should generate inputSchema with complex type props (ex: Product)",
  () => {
    const denoDocOutputComplextTypes =
      '[{"kind":"interface","name":"Props","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":19,"col":0},"declarationKind":"export","interfaceDef":{"extends":[],"methods":[],"properties":[{"name":"title","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":20,"col":2},"params":[],"computed":false,"optional":false,"tsType":{"repr":"string","kind":"keyword","keyword":"string"},"typeParams":[]},{"name":"productsResponse","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":21,"col":2},"params":[],"computed":false,"optional":false,"tsType":{"repr":"ProductList","kind":"typeRef","typeRef":{"typeParams":null,"typeName":"ProductList"}},"typeParams":[]}],"callSignatures":[],"indexSignatures":[],"typeParams":[]}},{"kind":"function","name":"default","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":24,"col":0},"declarationKind":"export","functionDef":{"params":[{"kind":"object","props":[{"kind":"assign","key":"title","value":null},{"kind":"assign","key":"productsResponse","value":null}],"optional":false,"tsType":{"repr":"Props","kind":"typeRef","typeRef":{"typeParams":null,"typeName":"Props"}}}],"returnType":null,"hasBody":true,"isAsync":false,"isGenerator":false,"typeParams":[]}},{"kind":"import","name":"forwardRef","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":1,"col":0},"declarationKind":"private","importDef":{"src":"https://esm.sh/v95/preact@10.10.6/compat/src/index.d.ts","imported":"forwardRef"}},{"kind":"import","name":"useRef","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":2,"col":0},"declarationKind":"private","importDef":{"src":"https://esm.sh/v95/preact@10.10.6/hooks/src/index.d.ts","imported":"useRef"}},{"kind":"import","name":"ProductList","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":4,"col":0},"declarationKind":"private","importDef":{"src":"file:///Users/lucis/deco/live/std/commerce/types/ProductList.ts","imported":"ProductList"}},{"kind":"import","name":"Product","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":5,"col":0},"declarationKind":"private","importDef":{"src":"file:///Users/lucis/deco/live/std/commerce/types/Product.ts","imported":"Product"}},{"kind":"import","name":"ProductCard","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":7,"col":0},"declarationKind":"private","importDef":{"src":"file:///Users/lucis/deco/zeedog/sections/ProductCard.tsx","imported":"default"}},{"kind":"import","name":"Ref","location":{"filename":"file:///Users/lucis/deco/zeedog/sections/ProductShelf.tsx","line":9,"col":0},"declarationKind":"private","importDef":{"src":"https://esm.sh/v95/preact@10.10.6/src/index.d.ts","imported":"Ref"}}]';

    const generatedSchema = getInputSchemaFromDocs(
      JSON.parse(denoDocOutputComplextTypes)
    );

    const expectedSchema = {
      title: "ProductShelf",
      type: "object",
      properties: {
        title: {
          title: "Title",
          type: "string",
        },
        productsResponse: {
          $id: 'live/std/commerce/types/ProductList.ts', 
          title: "Products Response",
          type: undefined,
        },
      },
    } as JSONSchema7;
    assertEquals(generatedSchema, expectedSchema);
  }
);
