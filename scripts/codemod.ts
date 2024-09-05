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

export interface TextFile {
  path: string;
  content: string;
}

export interface Delete {
  deleted: true;
}

export interface PatchFileMod {
  from: TextFile;
  to: TextFile;
}
export interface DeleteFileMod {
  from: TextFile;
  to: Delete;
}
export interface CreateFileMod {
  to: TextFile;
}
export type FileMod = PatchFileMod | DeleteFileMod | CreateFileMod;
const isDelete = (f: FileMod): f is DeleteFileMod => {
  return (f as DeleteFileMod)?.to?.deleted === true;
};

const isPatch = (f: FileMod): f is PatchFileMod => {
  // It's a patch if it has both 'from' and 'to' properties and 'to' is not a Delete
  return "from" in f && "to" in f && !(f as DeleteFileMod)?.to?.deleted;
};

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

export type FilePatcher<
  TContext extends CodeModContext = CodeModContext,
> = (
  txt: TextFile,
  ctx: TContext,
) => TextFile | Delete;

export interface JSONFile<T = Record<string, unknown>> {
  content: T;
  path: string;
}

export type JsonPatcher<
  TIn,
  TContext extends CodeModContext = CodeModContext,
  TOut = TIn,
> = (json: JSONFile<TIn>, ctx: TContext) => JSONFile<TOut> | Delete;

export interface TsFile {
  content: SourceFile;
  path: string;
}

export type TsPatcher<
  TContext extends CodeModContext = CodeModContext,
> = (text: TsFile, ctx: TContext) => TsFile | Delete;

export const json = <
  TIn,
  TOut = TIn,
  TContext extends CodeModContext = CodeModContext,
>(f: JsonPatcher<TIn, TContext, TOut>): FilePatcher<TContext> =>
({ path, content }, ctx) => {
  const result = f({
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

export const denoJSON = <
  TContext extends CodeModContext = CodeModContext,
>(f: JsonPatcher<DenoJSON, TContext>): CodeModTarget<TContext> => {
  return {
    options: { match: [/deno.json(c?)$/] },
    apply: json(f),
  };
};

export const ts = <TContext extends CodeModContext = CodeModContext>(
  f: TsPatcher<TContext>,
): FilePatcher<TContext> =>
(txt, ctx) => {
  // Initialize ts-morph project
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(txt.path);
  const prev = sourceFile.print();
  const out = f({ content: sourceFile, path: txt.path }, ctx);
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

export type SymbolMap = Record<
  string,
  Record<string, { moduleSpecifier: string; isTypeOnly?: boolean }>
>;
export const rewriteImport = (
  symbolMap: SymbolMap,
) =>
  ts(({ content: sourceFile, path }) => {
    // Get all import declarations
    const importDeclarations = sourceFile.getImportDeclarations();

    // To track the new imports we need to add
    const newImports: Record<string, ImportDeclarationStructure> = {};

    importDeclarations.forEach((importDecl) => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const namedImports = importDecl.getNamedImports();

      // Check if this module specifier is one that we want to replace
      const symbolMapForModule = symbolMap[moduleSpecifier];

      if (symbolMapForModule) {
        namedImports.forEach((namedImport) => {
          const name = namedImport.getName();
          const alias = namedImport.getAliasNode()?.getText(); // Get the alias if it exists
          const isTypeOnly = namedImport.isTypeOnly();

          // Check if the symbol exists in the map for this specific module
          if (symbolMapForModule[name]) {
            const {
              moduleSpecifier: newModuleSpecifier,
              isTypeOnly: newIsTypeOnly,
            } = symbolMapForModule[name];

            // Remove the old import
            namedImport.remove();

            // Prepare the new import
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

        // If all named imports have been removed, remove the entire import declaration
        if (importDecl.getNamedImports().length === 0) {
          importDecl.remove();
        }
      }
    });

    // Add the new imports
    Object.values(newImports).forEach((importStructure) => {
      sourceFile.addImportDeclaration(importStructure);
    });

    return {
      content: sourceFile,
      path,
    };
  });

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
export interface CodeMod<
  TContext extends CodeModContext = CodeModContext,
> {
  patches: FileMod[];
  name?: string;
  description?: string;
  ctx: TContext;
}

const applyPatch = async (p: FileMod, ctx: CodeModContext): Promise<void> => {
  if (isDelete(p)) {
    await ctx.fs.remove(p.from.path).catch(() => {});
  } else {
    if (isPatch(p) && (p.from.path !== p.to.path)) {
      await ctx.fs.remove(p.from.path).catch(() => {});
    }
    await ctx.fs.ensureFile(p.to.path);
    await ctx.fs.writeTextFile(p.to.path, p.to.content);
  }
};

const applyCodeMod = async ({ patches, name, description, ctx }: CodeMod) => {
  // Check if patches change the same file
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
      `⚠️  ${brightYellow(prettyPath)} -> ${
        brightYellow(patch.to.path.replaceAll(ctx.fs.cwd(), "."))
      }`,
    );

    if (yesToAll) continue;

    // Print line diffs
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

export interface CodeModTarget<
  TContext extends CodeModContext = CodeModContext,
> {
  options: WalkOptions;
  apply: FilePatcher<TContext>;
}

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
export type DefaultCodeModContext = Omit<CodeModContext, "fs"> & {
  fs?: CodeModContext["fs"];
};
export const codeMod = async <
  TContext extends DefaultCodeModContext = DefaultCodeModContext,
>(
  { name, description, targets, context }: CodeModOptions<TContext>,
) => {
  const patches: FileMod[] = [];
  const ctx = { fs: DEFAULT_FS, ...context } ??
    ({ fs: DEFAULT_FS });
  for (const target of targets) {
    for await (const file of ctx.fs.walk(Deno.cwd(), target.options)) {
      if (file.isFile) {
        const from: TextFile = {
          content: await ctx.fs.readTextFile(file.path),
          path: file.path,
        };
        const to = target.apply(
          from,
          ctx as TContext & CodeModContext,
        );
        patches.push({ from, to } as FileMod);
      }
    }
  }
  await applyCodeMod({ name, description, patches, ctx });
};
