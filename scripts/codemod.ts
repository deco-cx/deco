import { brightGreen, brightRed, brightYellow, gray } from "@std/fmt/colors";
import { ensureFile, walk } from "@std/fs";
import type { WalkOptions } from "@std/fs/walk";
import * as diff from "npm:diff@5.1.0";
import {
  type ImportDeclarationStructure,
  Project,
  type SourceFile,
  StructureKind,
} from "npm:ts-morph@^21.0";
import type { DenoJSON } from "./denoJSON.ts";
import { format } from "./formatter.ts";
import { upgradeDeps as upgradeImportMapDeps } from "./update.lib.ts";

/**
 * Represents a text file with its path and content.
 */
export interface TextFile {
  path: string;
  content: string;
}

/**
 * Represents a deletion operation on a file.
 */
export interface Delete {
  deleted: true;
}

/**
 * Represents a modification from one version of a file to another.
 */
export interface PatchFileMod {
  from: TextFile;
  to: TextFile;
}

/**
 * Represents a modification where a file has been deleted.
 */
export interface DeleteFileMod {
  from: TextFile;
  to: Delete;
}

/**
 * Represents a modification where a file has been created.
 */
export interface CreateFileMod {
  to: TextFile;
}

/**
 * A union type representing different types of file modifications.
 */
export type FileMod = PatchFileMod | DeleteFileMod | CreateFileMod;

/**
 * Checks if a file modification is a delete operation.
 * @param {FileMod} f - The file modification to check.
 * @returns {f is DeleteFileMod} True if the modification is a delete operation.
 */
const isDelete = (f: FileMod): f is DeleteFileMod => {
  return (f as DeleteFileMod)?.to?.deleted === true;
};

/**
 * Checks if a file modification is a patch operation.
 * @param {FileMod} f - The file modification to check.
 * @returns {f is PatchFileMod} True if the modification is a patch operation.
 */
const isPatch = (f: FileMod): f is PatchFileMod => {
  return "from" in f && "to" in f && !(f as DeleteFileMod)?.to?.deleted;
}

/**
 * Provides filesystem operations and the current working directory.
 */
export interface CodeModContext {
  fs: {
    cwd: () => string;
    remove: (path: string) => Promise<void>;
    ensureFile: (path: string) => Promise<void>;
    writeTextFile: (path: string, content: string) => Promise<void>;
    readTextFile: (path: string) => Promise<string>;
    walk: typeof walk;
  };
}

/**
 * A function type for patching text files.
 * @template TContext The type of the CodeModContext.
 */
export type FilePatcher<
  TContext extends CodeModContext = CodeModContext,
> = (
  txt: TextFile,
  ctx: TContext,
) => Promise<TextFile | Delete> | (TextFile | Delete);

/**
 * Represents a JSON file.
 * @template T The type of the JSON content.
 */
export interface JSONFile<T = Record<string, unknown>> {
  content: T;
  path: string;
}

/**
 * A function type for patching JSON files.
 * @template TIn The type of the input JSON content.
 * @template TContext The type of the CodeModContext.
 * @template TOut The type of the output JSON content.
 */
export type JsonPatcher<
  TIn,
  TContext extends CodeModContext = CodeModContext,
  TOut = TIn,
> = (json: JSONFile<TIn>, ctx: TContext) => Promise<JSONFile<TOut> | Delete> | (JSONFile<TOut> | Delete);

/**
 * Represents a TypeScript file.
 */
export interface TsFile {
  content: SourceFile;
  path: string;
}

/**
 * A function type for patching TypeScript files.
 * @template TContext The type of the CodeModContext.
 */
export type TsPatcher<
  TContext extends CodeModContext = CodeModContext,
> = (text: TsFile, ctx: TContext) => Promise<TsFile | Delete> | (TsFile | Delete);

/**
 * Creates a FilePatcher for JSON files.
 * @template TIn The type of the input JSON content.
 * @template TOut The type of the output JSON content.
 * @template TContext The type of the CodeModContext.
 * @param {JsonPatcher<TIn, TContext, TOut>} f - The JSON patcher function.
 * @returns {FilePatcher<TContext>} A file patcher function.
 */
export const json = <
  TIn,
  TOut = TIn,
  TContext extends CodeModContext = CodeModContext,
>(f: JsonPatcher<TIn, TContext, TOut>): FilePatcher<TContext> =>
  async ({ path, content }, ctx) => {
    const result = await f({
      path,
      content: JSON.parse(content),
    }, ctx);

    if ("deleted" in result) {
      return result;
    }
    return {
      path: result.path,
      content: JSON.stringify(result.content, null, 2),
    };
  };

/**
 * Creates a CodeModTarget for modifying Deno JSON files.
 * @template TContext The type of the CodeModContext.
 * @param {JsonPatcher<DenoJSON, TContext>} f - The JSON patcher function for Deno JSON files.
 * @returns {CodeModTarget<TContext>} A CodeModTarget object.
 */
export const denoJSON = <
  TContext extends CodeModContext = CodeModContext,
>(f: JsonPatcher<DenoJSON, TContext>): CodeModTarget<TContext> => {
  return {
    options: { match: [/deno.json(c?)$/] },
    apply: json(f),
  };
};

/**
 * Creates a CodeModTarget for upgrading dependencies in Deno JSON files.
 * @template TContext The type of the CodeModContext.
 * @param {RegExp} [packagesToCheck] - A regular expression to match packages to check for updates.
 * @returns {CodeModTarget<TContext>} A CodeModTarget object.
 */
export const upgradeDeps = <
  TContext extends CodeModContext = CodeModContext,
>(packagesToCheck?: RegExp): CodeModTarget<TContext> => {
  return denoJSON(async denoJSONFile => {
    const updatedDenoJSON = { ...denoJSONFile.content, imports: denoJSONFile.content.imports ?? {} };
    await upgradeImportMapDeps(updatedDenoJSON, false, packagesToCheck);
    return {
      path: denoJSONFile.path,
      content: updatedDenoJSON
    }
  });
};

/**
 * Creates a FilePatcher for TypeScript files.
 * @template TContext The type of the CodeModContext.
 * @param {TsPatcher<TContext>} f - The TypeScript patcher function.
 * @returns {FilePatcher<TContext>} A file patcher function.
 */
export const ts = <TContext extends CodeModContext = CodeModContext>(
  f: TsPatcher<TContext>,
): FilePatcher<TContext> =>
  async (txt, ctx) => {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(txt.path);
    const prev = sourceFile.print();
    const out = await f({ content: sourceFile, path: txt.path }, ctx);
    if ("deleted" in out) {
      return out;
    }
    if (prev === out.content.print()) {
      return {
        path: out.path,
        content: txt.content,
      };
    }
    return {
      path: out.path,
      content: out.content.print(),
    };
  };

/**
 * A map of symbols and their module specifiers.
 * @typedef {Record<string, Record<string, { moduleSpecifier: string; isTypeOnly?: boolean }>>} SymbolMap
 */
export type SymbolMap = Record<
  string,
  Record<string, { moduleSpecifier: string; isTypeOnly?: boolean }>
>;

/**
 * Rewrites import statements in TypeScript files based on a symbol map.
 * @param {SymbolMap} symbolMap - A map of symbols to rewrite.
 * @returns {FilePatcher<CodeModContext>} A file patcher function for rewriting imports.
 */
export const rewriteImport = (
  symbolMap: SymbolMap,
) =>
  ts(({ content: sourceFile, path }) => {
    const importDeclarations = sourceFile.getImportDeclarations();
    const newImports: Record<string, ImportDeclarationStructure> = {};

    importDeclarations.forEach((importDecl) => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const namedImports = importDecl.getNamedImports();
      const symbolMapForModule = symbolMap[moduleSpecifier];

      if (symbolMapForModule) {
        namedImports.forEach((namedImport) => {
          const name = namedImport.getName();
          const alias = namedImport.getAliasNode()?.getText();
          const isTypeOnly = namedImport.isTypeOnly();
          if (symbolMapForModule[name]) {
            const { moduleSpecifier: newModuleSpecifier, isTypeOnly: newIsTypeOnly } = symbolMapForModule[name];
            namedImport.remove();
            if (!newImports[newModuleSpecifier]) {
              newImports[newModuleSpecifier] = {
                kind: StructureKind.ImportDeclaration,
                moduleSpecifier: newModuleSpecifier,
                namedImports: [],
              };
            }
            const namedImports = newImports[newModuleSpecifier].namedImports;
            if (Array.isArray(namedImports)) {
              namedImports.push({
                name,
                alias,
                isTypeOnly: newIsTypeOnly ?? isTypeOnly,
              });
            }
          }
        });
        if (importDecl.getNamedImports().length === 0) {
          importDecl.remove();
        }
      }
    });

    Object.values(newImports).forEach((importStructure) => {
      sourceFile.addImportDeclaration(importStructure);
    });

    return {
      content: sourceFile,
      path,
    };
  });

/**
 * Creates a CodeModTarget for rewriting imports in TypeScript files.
 * @template TContext The type of the CodeModContext.
 * @param {SymbolMap} symbolMap - A map of symbols to rewrite.
 * @returns {CodeModTarget<TContext>} A CodeModTarget object.
 */
export const rewriteImports = <
  TContext extends CodeModContext = CodeModContext,
>(
  symbolMap: SymbolMap,
): CodeModTarget<TContext> => {
  return {
    options: {
      match: [/.ts(x?)$/],
      skip: [/node_modules/, /.git/],
      includeDirs: false,
    },
    apply: rewriteImport(symbolMap),
  };
};

/**
 * Represents a code modification.
 * @template TContext The type of the CodeModContext.
 */
export interface CodeMod<
  TContext extends CodeModContext = CodeModContext,
> {
  patches: FileMod[];
  name?: string;
  description?: string;
  ctx: TContext;
}

/**
 * Applies a file patch.
 * @param {FileMod} p - The file modification.
 * @param {CodeModContext} ctx - The code modification context.
 * @returns {Promise<void>} A promise that resolves when the patch is applied.
 */
const applyPatch = async (p: FileMod, ctx: CodeModContext): Promise<void> => {
  if (isDelete(p)) {
    await ctx.fs.remove(p.from.path).catch(() => { });
  } else {
    if (isPatch(p)) {
      if (p.from.path !== p.to.path) {
        await ctx.fs.remove(p.from.path).catch(() => { });
      } else if (p.from.content === p.to.content) {
        return;
      }
    }
    await ctx.fs.ensureFile(p.to.path);
    await ctx.fs.writeTextFile(p.to.path, p.to.content);
  }
};

/**
 * Applies a code modification.
 * @param {CodeMod} mod - The code modification.
 * @returns {Promise<void>} A promise that resolves when the code modification is applied.
 */
const applyCodeMod = async ({ patches, name, description, ctx }: CodeMod) => {
  const yesToAll = Boolean(Deno.args.find((x) => x === "--y"));
  for (const patch of patches) {
    if (isDelete(patch)) {
      console.log(`🚨 ${brightRed(patch.from.path)} will be deleted.`);
      continue;
    }

    const { content, path: fromPath } = isPatch(patch)
      ? patch.from
      : { content: "", path: "" };

    if (content === patch.to.content && fromPath === patch.to.path) {
      continue;
    }

    const prettyPath = fromPath.replaceAll(ctx.fs.cwd(), ".");

    const linesDiff = diff.diffLines(
      content,
      await format(patch.to.content).then((formatted) =>
        formatted ?? patch.to.content
      ).catch(() => patch.to.content),
    );

    if (linesDiff.length === 1 && fromPath === patch.to.path) {
      const change = linesDiff[0].added ? "(new file)" : undefined;
      if (change) {
        console.log(gray(`✅ ${prettyPath} ${change}`));
      }
      continue;
    }

    console.log(
      `⚠️  ${brightYellow(prettyPath)} -> ${brightYellow(patch.to.path.replaceAll(ctx.fs.cwd(), "."))
      }`,
    );

    if (yesToAll) continue;

    for (const { added, removed, value } of linesDiff) {
      const color = added ? brightGreen : removed ? brightRed : gray;
      console.log(color(value));
    }
  }

  description && console.log(`These changes ${description}`);
  const ok = yesToAll || confirm("Do you want to proceed?");
  if (!ok) return;

  name && console.log(`Applying patch ${name}`);
  for (const patch of patches) {
    await applyPatch(patch, ctx);
  }
};

/**
 * Represents a target for applying a code modification.
 * @template TContext The type of the CodeModContext.
 */
export interface CodeModTarget<
  TContext extends CodeModContext = CodeModContext,
> {
  options: WalkOptions;
  apply: FilePatcher<TContext>;
}

/**
 * Represents options for applying code modifications.
 * @template TContext The type of the CodeModContext.
 */
export interface CodeModOptions<
  TContext extends DefaultCodeModContext = DefaultCodeModContext,
> {
  name?: string;
  description?: string;
  context?: TContext;
  targets: CodeModTarget<TContext & CodeModContext>[];
}

const DEFAULT_FS: CodeModContext["fs"] = {
  cwd: () => Deno.cwd(),
  remove: Deno.remove,
  ensureFile: ensureFile,
  writeTextFile: Deno.writeTextFile,
  readTextFile: Deno.readTextFile,
  walk: walk,
};

/**
 * Represents the default CodeModContext.
 */
export type DefaultCodeModContext = Omit<CodeModContext, "fs"> & {
  fs?: CodeModContext["fs"];
};

/**
 * Applies a code modification with the provided options.
 * @template TContext The type of the CodeModContext.
 * @param {CodeModOptions<TContext>} options - The code modification options.
 * @returns {Promise<void>} A promise that resolves when the code modification is applied.
 */
export const codeMod = async <
  TContext extends DefaultCodeModContext = DefaultCodeModContext,
>({
  name, description, targets, context
}: CodeModOptions<TContext>) => {
  const patches: FileMod[] = [];
  const ctx = { fs: DEFAULT_FS, ...context } ?? ({ fs: DEFAULT_FS });
  const fsNext: Record<string, string> = {};

  for (const target of targets) {
    for await (const file of ctx.fs.walk(Deno.cwd(), target.options)) {
      if (file.isFile) {
        const from: TextFile = {
          content: fsNext[file.path] ?? await ctx.fs.readTextFile(file.path),
          path: file.path,
        };
        const to = await target.apply(from, ctx as TContext & CodeModContext);
        if ("deleted" in to) {
          fsNext[file.path] = ""
        } else {
          fsNext[from.path] = "";
          fsNext[to.path] = to.content;
        }
        patches.push({ from, to } as FileMod);
      }
    }
  }
  await applyCodeMod({ name, description, patches, ctx });
};
