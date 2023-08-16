import { JSONSchema7 } from "$live/deps.ts";
import { ParsedSource } from "https://denopkg.com/deco-cx/deno_ast_wasm@0.1.0/mod.ts";
import type { HasSpan } from "https://esm.sh/v130/@swc/wasm@1.3.76";
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
  // deno-lint-ignore no-explicit-any
  return (s as any)?.declaration?.body?.body ?? (s as any)?.body?.body ??
    (s as ModuleSpannable)?.body ??
    (s as ImportDeclarationSpannable)?.specifiers;
};

// deno-lint-ignore no-explicit-any
const isSpannableArray = (child: any): child is Spannable[] => {
  return Array.isArray(child) && child.length > 0 &&
    child[0].span !== undefined;
};
// deno-lint-ignore no-explicit-any
export const assignCommentsForSpannable = (_rootSpan: any) => {
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
    // deno-lint-ignore no-explicit-any
  } as any;
  assignCommentsForSpannable(_rootSpan);
};

// deno-lint-ignore no-explicit-any
export const commentsFromSpannable = (item: any) => {
  return (item as unknown as { comments: Comment[] })?.comments ?? [];
};
const commentsToJsDoc = (comments: Comment[]): JSONSchema7 => {
  const jsdocRegex = /@(\w+)\s+([^\n@]+)/g;
  const jsDoc: Record<string, number | string | boolean> = {};

  for (const comment of comments) {
    let match;

    while ((match = jsdocRegex.exec(comment.text))) {
      const [, tag, value] = match;
      jsDoc[tag] = parseJSDocAttribute(tag, value.trim());
    }
  }
  return jsDoc as JSONSchema7;
};

// deno-lint-ignore no-explicit-any
export const spannableToJsDoc = (spannable: any): JSONSchema7 => {
  return commentsToJsDoc(commentsFromSpannable(spannable));
};
