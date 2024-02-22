// deno-lint-ignore-file no-explicit-any
import type { HasSpan } from "https://esm.sh/v130/@swc/wasm@1.3.76";
import { JSONSchema7 } from "../../deps.ts";
import { ParsedSource } from "./deps.ts";
import { parseJSDocAttribute } from "./utils.ts";

export interface Comment {
  text: string;
  span_lo: number;
  span_hi: number;
}

export interface SpannableBase extends HasSpan {
  comments: Comment[];
}

export interface ImportDeclarationSpannable extends SpannableBase {
  specifiers: Spannable[];
}
export interface ExportNamedDeclarationSpannable extends SpannableBase {
  specifiers: Spannable[];
}
export interface ModuleSpannable extends SpannableBase {
  body: Spannable[];
}

export type Spannable =
  | ModuleSpannable
  | ImportDeclarationSpannable
  | ExportNamedDeclarationSpannable;

const getChildren = (s: Spannable) => {
  return (s as any)?.declaration?.body?.body ?? (s as any)?.body?.body ??
    (s as ModuleSpannable)?.body ??
    (s as ImportDeclarationSpannable)?.specifiers;
};

const isSpannableArray = (child: any): child is Spannable[] => {
  return Array.isArray(child) && child.length > 0 &&
    child[0].span !== undefined;
};

/**
 * This function allocate comments where it should be placed.
 * When a program is parsed all comments are ignored meaning that it will not be part of the code AST.
 * The problem is that we use comments to enrich JSONSchema based on the JsDoc attribute.
 * As comments are treat as a separate array of strings containing only the information of which characeter it starts and ends (spannable).
 * This code distribute it based on the span attribute of the comments, matching with the body span attribute.
 *
 * So it basically starts with all comments of the module, and then distribute it into body items, it recursively do the same thing inside a body item declaration if it is a TsInterface declaration,
 * so that we have the comments assigned to the properties as well.
 */
const assignCommentsForSpannable = (_rootSpan: any) => {
  const children = getChildren(_rootSpan) ?? [];
  const { comments: rootSpanComments, ...rootSpan } = _rootSpan as Spannable;
  if (rootSpanComments.length === 0) {
    return;
  }
  let commentIdx = 0;
  const { start: rootStart } = rootSpan.span;
  while (
    commentIdx < rootSpanComments.length &&
    rootSpanComments[commentIdx].span_hi < rootStart
  ) {
    commentIdx++;
  }
  const lastCommentIdx = commentIdx;
  for (
    const child of isSpannableArray(children) ? children : []
  ) {
    const { span: { end: childEnd } } = child;
    child.comments ??= [];
    while (
      commentIdx < rootSpanComments.length &&
      rootSpanComments[commentIdx].span_lo < childEnd
    ) {
      child.comments.push(rootSpanComments[commentIdx]);
      commentIdx++;
    }
    assignCommentsForSpannable(child);
  }
  _rootSpan.comments = _rootSpan.comments.slice(0, lastCommentIdx);
};

export const assignComments = (program: ParsedSource) => {
  const _rootSpan = {
    comments: program.comments,
    body: program.program.body,
    span: { ...program.program.span, start: 0 },
  } as any;
  assignCommentsForSpannable(_rootSpan);
};

export const commentsFromSpannable = (item: any) => {
  return (item as unknown as { comments: Comment[] })?.comments ?? [];
};

/**
 * Parses the JsDoc using the regex pattern below.
 */
const commentsToJSONSchema = (comments: Comment[]): JSONSchema7 => {
  const jsdocRegex = /@(\w+)\s+([^\n@]+)/g;
  const jsDoc: Record<string, null | number | string | boolean | string[]> = {};

  for (const comment of comments) {
    let match;

    while ((match = jsdocRegex.exec(comment.text))) {
      const [, tag, value] = match;
      jsDoc[tag] = parseJSDocAttribute(tag, value.trim());
    }
  }
  return jsDoc as JSONSchema7;
};

/**
 * Parses and builds a JSONSchema based on the JsDoc attributes.
 * E.g `@title MyTitle` becomes `{ title: "MyTitle" }`
 * Receives a @param spannable as an argument which is any statement or expression that contains `.span` as a property (inherits from `HasSpan`).
 */
export const spannableToJSONSchema = (spannable: any): JSONSchema7 => {
  return commentsToJSONSchema(commentsFromSpannable(spannable));
};
