// deno-lint-ignore-file no-explicit-any
import { withoutLocalModules } from "$live/engine/fresh/manifest.ts";
import { DecoManifest } from "$live/types.ts";

export interface DefaultImport {
  alias: string;
}
export interface NamedImport {
  import: string;
  as?: string;
}
export interface ModuleImport {
  as: string;
}
export type ImportClause = DefaultImport | NamedImport | ModuleImport;

const equalClause = (a: ImportClause, b: ImportClause): boolean => {
  return (
    (a as DefaultImport).alias === (b as DefaultImport).alias &&
    (a as NamedImport).as === (b as NamedImport).as &&
    (a as NamedImport).import === (b as NamedImport).import
  );
};

const isDefaultClause = (v: ImportClause): v is DefaultImport => {
  return (v as DefaultImport).alias !== undefined;
};

export interface FunctionCall {
  identifier: string;
  params: JSONValue[];
}

export interface Variable {
  identifier: string;
}

export interface JS<T extends Record<string, any> = any> {
  kind: "js";
  raw: FunctionCall | Variable | T;
}
const isObjRaw = (
  v: FunctionCall | Variable | Record<string, unknown>,
): v is Record<string, unknown> => {
  return (v as FunctionCall).identifier === undefined;
};

const isFunctionCall = (v: FunctionCall | Variable): v is FunctionCall => {
  return (v as FunctionCall)?.params !== undefined;
};

export interface Primitive<T = unknown> {
  kind: "primitive";
  type: "string" | "number" | "boolean";
  value: T;
}

export interface Obj {
  kind: "obj";
  value: JSONObject;
}

export type JSONValue = Primitive | JS | Obj;
const isPrimitive = (v: JSONValue): v is Primitive => {
  return (v as Primitive).kind === "primitive";
};

const isObj = (v: JSONValue): v is Obj => {
  return (v as Obj).kind === "obj";
};

export type JSONObject = Partial<Record<string, JSONValue>>;
export interface Import {
  from: string;
  clauses: ImportClause[];
}
export interface ManifestBuilder {
  mergeWith: (def: DecoManifest[]) => ManifestBuilder;
  equal: (other: ManifestBuilder) => boolean;
  data: ManifestData;
  toJSONString: () => string;
  addImports: (...imports: Import[]) => ManifestBuilder;
  addManifestValues: (...vals: [string, JSONValue][]) => ManifestBuilder;
  addValuesOnManifestKey: (
    key: string,
    ...vals: [string, JSONValue][]
  ) => ManifestBuilder;
  addExports: (...exports: Export[]) => ManifestBuilder;
  addExportDefault: (dfs: ExportDefault) => ManifestBuilder;
  addStatements: (...statements: Statement[]) => ManifestBuilder;
  build(): string;
}
// function type any of root if not output
// if output gen output and add anyOf function type
export interface ExportDefault {
  variable: Variable;
}
export interface ExportAssignment {
  name: string;
  js: JS;
}

export interface ExportConst {
  name: string;
}

export type Export = ExportConst | ExportAssignment;

export interface Assignment {
  variable: string;
  assign: FunctionCall | Variable;
}

export type Statement = Assignment;

export interface ManifestData {
  namespace: string;
  imports: Record<string, ImportClause[]>;
  manifest: JSONObject;
  exports: Export[];
  statements?: Statement[];
  exportDefault?: ExportDefault;
}

const stringifyStatement = (st: Statement): string => {
  return `${st.variable} = ${stringifyJS({ kind: "js", raw: st.assign })}`;
};

const stringifyImport = ([from, clauses]: [string, ImportClause[]]): string => {
  return `import ${
    clauses
      .map((clause) =>
        isDefaultClause(clause)
          ? `* as ${clause.alias}`
          : (clause as NamedImport).import
          ? `{ ${(clause as NamedImport).import} ${
            clause.as ? "as " + clause.as : ""
          }}`
          : clause.as
      )
      .join(",")
  } from "${from}"`;
};

const stringifyObj = (obj: JSONObject, sortKeys = true): string => {
  const entries = Object.entries(obj);
  const entriesOrSorted = sortKeys
    ? entries.sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    : entries;
  return `{
    ${
    entriesOrSorted
      .map(([key, v]) => {
        return `"${key}": ${stringifyJSONValue(v!)}`;
      })
      .join(",\n")
  }
}
`;
};

const stringifyJSONValue = (obj: JSONValue): string => {
  if (isPrimitive(obj)) {
    if (obj.type === "string") {
      return `"${obj.value}"`;
    }
    return `${obj.value}`;
  }
  if (isObj(obj)) {
    return stringifyObj(obj.value);
  }
  return stringifyJS(obj);
};

const stringifyJS = (js: JS): string => {
  if (isObjRaw(js.raw)) {
    return JSON.stringify(js.raw);
  }
  if (isFunctionCall(js.raw)) {
    return `${js.raw.identifier}(${
      js.raw.params
        .map(stringifyJSONValue)
        .join(",")
    })`;
  }

  return js.raw.identifier;
};

const stringifyExport = (exp: Export): string => {
  const nExp = (exp as ExportAssignment).js;
  if (nExp !== undefined) {
    return `export const ${exp.name} = ${stringifyJS(nExp)}`;
  }
  return `export ${exp.name}`;
};

export const stringify = ({
  imports,
  manifest,
  statements,
  exports,
  exportDefault,
}: ManifestData): string => {
  manifest["routes"] ??= { kind: "obj", value: {} };
  manifest["islands"] ??= { kind: "obj", value: {} };

  manifest["baseUrl"] = {
    kind: "js",
    raw: { identifier: "import.meta.url" },
  };
  return `// DO NOT EDIT. This file is generated by deco.
// This file SHOULD be checked into source version control.
// This file is automatically updated during development when running \`dev.ts\`.

import { DecoManifest } from "$live/types.ts";
${Object.entries(imports).map(stringifyImport).join("\n")}

const manifest = ${stringifyObj(manifest, false)}

export type Manifest = typeof manifest;

${exports.map(stringifyExport).join("\n")}
${statements ? statements.map(stringifyStatement).join("\n") : ""}
${
    exportDefault
      ? `export default ${exportDefault.variable.identifier} satisfies DecoManifest`
      : ""
  }
`;
};

export const newManifestBuilder = (initial: ManifestData): ManifestBuilder => {
  return {
    mergeWith: (
      def: (DecoManifest & { config?: unknown })[],
    ): ManifestBuilder => {
      let innerBuilder = newManifestBuilder(initial);

      let manI = 0;
      for (const manifest of def) {
        manI++;
        const {
          routes: _doNotMergeRoutes,
          islands: _doNotMergeIslands,
          config: _ignoreConfig,
          baseUrl: _ignoreBaseUrl,
          ...blocks
        } = manifest;

        let blockN = 0;
        for (
          const [block, value] of Object.entries(blocks)
        ) {
          blockN++;
          let blockC = 0;
          for (
            const path of Object.keys(
              withoutLocalModules(block, value ?? {}),
            )
          ) {
            const ref = `i${manI}${"$".repeat(blockN)}${blockC}`;
            blockC++;
            innerBuilder = innerBuilder
              .addImports({
                from: path,
                clauses: [{ alias: ref }],
              })
              .addValuesOnManifestKey(block, [
                path,
                {
                  kind: "js",
                  raw: { identifier: ref },
                },
              ]);
          }
        }
      }
      return innerBuilder;
    },
    data: initial,
    equal: (other: ManifestBuilder): boolean => {
      const sameImportLength =
        other.data.imports.length === initial.imports.length;
      if (!sameImportLength) {
        return false;
      }
      const importsFrom = Object.keys(initial.imports);
      const otherImportsFrom = Object.keys(other.data.imports);
      for (let i = 0; i < importsFrom.length; i++) {
        if (importsFrom[i] !== otherImportsFrom[i]) {
          return false;
        }
        const [importThis, importOther] = [
          initial.imports[importsFrom[i]],
          other.data.imports[otherImportsFrom[i]],
        ];
        if (importThis.length !== importOther.length) {
          return false;
        }

        for (let k = 0; k < importThis.length; k++) {
          const [clauseThis, clauseOther] = [importThis[k], importOther[k]];

          if (!equalClause(clauseThis, clauseOther)) {
            return false;
          }
        }
      }
      // TODO Fix me @author Marcos V. Candeia this is slow
      return JSON.stringify(initial) === JSON.stringify(other.data);
    },
    toJSONString: () => JSON.stringify(initial),
    build: () => stringify(initial),
    addExportDefault: (dfs: ExportDefault): ManifestBuilder => {
      return newManifestBuilder({ ...initial, exportDefault: dfs });
    },
    addImports: (...imports: Import[]): ManifestBuilder => {
      const currImports = initial.imports;
      for (const importStr of imports) {
        currImports[importStr.from] ??= [];
        currImports[importStr.from] = [
          ...currImports[importStr.from],
          ...importStr.clauses,
        ];
        // if import defaults so only one import is allowed
        const defaultClause = currImports[importStr.from].filter(
          isDefaultClause,
        );
        if (defaultClause.length > 0) {
          currImports[importStr.from] = [
            defaultClause[defaultClause.length - 1],
          ];
        }
      }
      return newManifestBuilder({
        ...initial,
        imports: currImports,
      });
    },
    addStatements: (...statements: Statement[]): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        statements: [...(initial.statements ?? []), ...statements],
      });
    },
    addManifestValues: (...vals: [string, JSONValue][]): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        manifest: vals.reduce((man, [k, v]) => {
          return { ...man, [k]: v };
        }, initial.manifest),
      });
    },
    addValuesOnManifestKey: (
      key: string,
      ...vals: [string, JSONValue][]
    ): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        manifest: vals.reduce(
          (man, [k, v]) => {
            const curr = man[key];
            if (isObj(curr!)) {
              return {
                ...man,
                [key]: { ...curr, value: { ...curr.value, [k]: v } },
              };
            }
            return { ...man, [key]: v };
          },
          {
            ...initial.manifest,
            [key]: initial.manifest[key] ?? { kind: "obj", value: {} },
          },
        ),
      });
    },
    addExports: (...exports: Export[]): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        exports: [...initial.exports, ...exports],
      });
    },
  };
};
