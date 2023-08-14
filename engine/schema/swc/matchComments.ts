import type { HasSpan } from "https://esm.sh/v130/@swc/wasm@1.3.76";

export interface Comment extends HasSpan {
  text: string;
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
  return (s as ModuleSpannable)?.body ??
    (s as ImportDeclarationSpannable)?.specifiers;
};

export const assignComments = (_rootSpan: any) => {
  const children = getChildren(_rootSpan);
  if (!children || children.length === 0) {
    return;
  }
  const { comments: rootSpanComments, ...rootSpan } = _rootSpan as Spannable;
  let commentIdx = 0;
  const { start: rootStart } = rootSpan.span;
  while (
    commentIdx < rootSpanComments.length &&
    rootSpanComments[commentIdx].span.end < rootStart
  ) {
    commentIdx++;
  }
  const lastCommentIdx = commentIdx;
  for (
    const { span: { end: childEnd }, comments } of getChildren(
      { comments: rootSpanComments, ...rootSpan },
    )
  ) {
    while (
      commentIdx < comments.length && comments[commentIdx].span.start < childEnd
    ) {
      comments.push(comments[commentIdx]);
      commentIdx++;
    }
  }
  _rootSpan.comments = _rootSpan.comments.slice(0, lastCommentIdx);
};
