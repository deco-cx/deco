import { isDeno } from "../../compat/mod.ts";

// ParsedSource type for cross-runtime compatibility
export interface ParsedSource {
  body: unknown[];
  specifier: string;
  text: string;
  comments: Array<{
    kind: string;
    text: string;
    span: { start: number; end: number };
  }>;
}

// AST parsing - only available in Deno with WASM
// In Bun/Node, schema generation must be pre-computed
let _parse: (specifier: string, text: string) => ParsedSource;

if (isDeno) {
  try {
    const astModule = await import("@deco/deno-ast-wasm");
    _parse = astModule.parse;
  } catch {
    console.warn("AST parser not available, schema generation disabled");
    _parse = (specifier, text) => ({
      body: [],
      specifier,
      text,
      comments: [],
    });
  }
} else {
  // Stub for Bun/Node - schemas should be pre-generated
  _parse = (specifier, text) => ({
    body: [],
    specifier,
    text,
    comments: [],
  });
}

export const parse = _parse;
