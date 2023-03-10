// deno-lint-ignore-file
import {
  schemeableToJSONSchema,
  union,
} from "$live/engine/schema/schemeable.ts";
import { Schemeable } from "$live/engine/schema/transform.ts";
import { JSONSchema7 } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";
import { DecoManifest } from "$live/engine/adapters/fresh/manifest.ts";
import { deepMergeDefinitions } from "$live/engine/adapters/fresh/merge.ts";

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
  v: FunctionCall | Variable | Record<string, unknown>
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
  addSchemeables: (...s: Schemeable[]) => ManifestBuilder;
  schemeableAnyOf: (id: string, ref: string) => ManifestBuilder;
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

export interface Schemas {
  definitions: Record<string, any>;
  root: Record<string, any>; // JSON Schema does not work because of the incompatibility with union types
}
export interface ManifestData {
  schemas: Schemas;
  imports: Record<string, ImportClause[]>;
  manifest: JSONObject;
  exports: Export[];
  statements?: Statement[];
  exportDefault?: ExportDefault;
  schemeables?: Record<string, Schemeable>;
}

const stringifyStatement = (st: Statement): string => {
  return `${st.variable} = ${stringifyJS({ kind: "js", raw: st.assign })}`;
};

const stringifyImport = ([from, clauses]: [string, ImportClause[]]): string => {
  return `import ${clauses
    .map((clause) =>
      isDefaultClause(clause)
        ? `* as ${clause.alias}`
        : (clause as NamedImport).import
        ? `{ ${(clause as NamedImport).import} ${
            clause.as ? "as " + clause.as : ""
          }}`
        : clause.as
    )
    .join(",")} from "${from}"`;
};

const stringifyObj = (obj: JSONObject): string => {
  return `{
    ${Object.entries(obj)
      .map(([key, v]) => {
        return `"${key}": ${stringifyJSONValue(v!)}`;
      })
      .join(",\n")}
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
    return `${js.raw.identifier}(${js.raw.params
      .map(stringifyJSONValue)
      .join(",")})`;
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

export type DeepDefinitions = {
  [key: string]: JSONSchema7 | DeepDefinitions;
};

const mergeSchemasRoot = (
  a: Schemas["root"],
  b: Schemas["root"]
): Schemas["root"] => {
  let mergedRoot: Schemas["root"] = {};
  const allRootBlocks = { ...a, ...b };

  for (const block of Object.keys(allRootBlocks)) {
    const duplicated: Record<string, boolean> = {};
    mergedRoot[block] = {
      title: block,
      anyOf: [...(a[block]?.anyOf ?? []), ...(b[block]?.anyOf ?? [])].filter(
        (ref) => {
          const has = duplicated[ref.$ref];
          duplicated[ref.$ref] = true;
          return !has;
        }
      ),
    };
  }
  return mergedRoot;
};

const mergeStates = (a: JSONSchema7, b: JSONSchema7): JSONSchema7 => {
  return {
    ...a,
    ...b,
    required: [...(a?.required ?? []), ...(b?.required ?? [])],
    properties: {
      ...(a?.properties ?? {}),
      ...(b?.properties ?? {}),
    },
  };
};

const fileNameOf = (id: string): string => {
  const [fileName] = id.split("@");
  return fileName;
};

export const stringify = ({
  imports,
  manifest,
  statements,
  exports,
  exportDefault,
  schemeables,
  schemas,
}: ManifestData): string => {
  manifest["routes"] ??= { kind: "obj", value: {} };
  manifest["islands"] ??= { kind: "obj", value: {} };
  manifest["config"] = {
    kind: "js",
    raw: { identifier: "config" },
  };

  manifest["baseUrl"] = {
    kind: "js",
    raw: { identifier: "import.meta.url" },
  };
  // Generate all JSONSchema definitions and also create the `root` property, pointing to the respective configuration block.
  const [definitions, root, entrypoint] = Object.values(
    schemeables ?? {}
  ).reduce(
    ([def, root, entrypoint], schemeable) => {
      const [nDef, _] = schemeableToJSONSchema(def, schemeable) as [
        Record<string, JSONSchema7 & { type: string | JSONSchema7["type"] }>,
        unknown
      ];
      const curr = schemeable.root
        ? root[schemeable.root] ?? { anyOf: [] }
        : undefined;
      const defRef = { $ref: `#/definitions/${schemeable.id}` };

      const entrypointFile = fileNameOf(schemeable.id!);
      // This is not straightforward,
      // routes are considered entrypoints
      // whenever you define a new configuration so its added as an entrypoint.
      const entrypointConfig =
        schemeable.root === "routes"
          ? {
              ...entrypoint,
              required: [...(entrypoint.required ?? []), entrypointFile],
              properties: {
                ...entrypoint.properties,
                [entrypointFile]: defRef,
              },
            }
          : entrypoint;

      const nRoot = curr
        ? {
            ...root,
            [schemeable.root!]: {
              ...curr,
              anyOf: [...(curr?.anyOf ?? []), defRef],
            },
          }
        : root;

      return [nDef, nRoot, entrypointConfig];
    },
    [{}, {}, {}] as [Schemas["definitions"], Schemas["root"], JSONSchema7]
  );

  // React json schema form does not support $id property to refer the inner json schema.
  // Meaning that our components cannot be addressed using its path, because a path `/` is considered as a level of json schema indentation.
  // so you cannot have `./loaders/loader.ts` you should have three levels {".": { "loaders": {"loader.ts":{}}}}, so this function split the id and create the multi-level json schema
  const defNormalized: DeepDefinitions = {};
  for (const key of Object.keys(definitions)) {
    const parts = key.split("/");
    let curr: DeepDefinitions = defNormalized;
    for (const part of parts.slice(0, parts.length - 1)) {
      curr[part] ??= {};
      curr = curr[part] as DeepDefinitions;
    }
    curr[parts[parts.length - 1]] = definitions[key];
  }

  const { state, ...exceptState } = schemas.root;
  // merge roots to merge imports and self generated json schema.
  let mergedRoots = mergeSchemasRoot(root, exceptState);
  const configState = Object.keys(mergedRoots).reduce(
    (curr, key) => {
      return { ...curr, anyOf: [...curr.anyOf, { $ref: `#/root/${key}` }] };
    },
    { anyOf: [] as JSONSchema7[] }
  );
  // merge states
  const entrypointState = mergeStates(state, entrypoint);

  manifest["schemas"] = {
    kind: "js",
    raw: {
      definitions: deepMergeDefinitions(defNormalized, schemas.definitions),
      root: {
        ...mergedRoots,
        state: {
          type: "object",
          ...entrypointState,
          additionalProperties: configState,
        },
      },
    },
  };
  return `// DO NOT EDIT. This file is generated by deco.
// This file SHOULD be checked into source version control.
// This file is automatically updated during development when running \`dev.ts\`.

import config from "./deno.json" assert { type: "json" };
${Object.entries(imports).map(stringifyImport).join("\n")}

const manifest = ${stringifyObj(manifest)}

${exports.map(stringifyExport).join("\n")}
${statements ? statements.map(stringifyStatement).join("\n") : ""}
${exportDefault ? `export default ${exportDefault.variable.identifier}` : ""}
`;
};

export const newManifestBuilder = (initial: ManifestData): ManifestBuilder => {
  return {
    addSchemeables: (...s: Schemeable[]): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        schemeables: s.reduce((curr, n) => {
          const schemeableID = n.id ?? crypto.randomUUID();
          return {
            ...curr,
            [schemeableID]: curr[schemeableID] ?? n,
          };
        }, initial.schemeables ?? {}),
      });
    },
    schemeableAnyOf: (id: string, ref: string): ManifestBuilder => {
      const schemeable = initial.schemeables?.[id];
      if (!schemeable) {
        return newManifestBuilder(initial);
      }
      return newManifestBuilder({
        ...initial,
        schemeables: { ...initial.schemeables, [id]: union(schemeable, ref) },
      });
    },
    mergeWith: (def: DecoManifest[]): ManifestBuilder => {
      let innerBuilder = newManifestBuilder(initial);
      let mergedRoots: Schemas["root"] = {};
      let mergedDefinitions: Schemas["definitions"] = {};
      let manI = 0;
      for (const manifest of def) {
        manI++;
        const {
          routes: _doNotMergeRoutes,
          islands: _doNotMergeIslands,
          config: _ignoreConfig,
          baseUrl: _ignoreBaseUrl,
          schemas: {
            root: { state, ...root },
            definitions,
          },
          ...blocks
        } = manifest;

        mergedRoots = mergeSchemasRoot(mergedRoots, root);
        mergedRoots["state"] = mergeStates(mergedRoots["state"], state);
        // TODO Improve generation performance here @author Marcos V. Candeia
        mergedDefinitions = deepMergeDefinitions(
          mergedDefinitions,
          definitions
        );

        let blockN = 0;
        for (const [block, value] of Object.entries(blocks)) {
          blockN++;
          let blockC = 0;
          for (const path of Object.keys(value ?? {})) {
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
      const data = innerBuilder.data;
      return newManifestBuilder({
        ...data,
        schemas: {
          definitions: { ...data.schemas.definitions, ...mergedDefinitions },
          root: { ...data.schemas.root, ...mergedRoots },
        },
      });
    },
    data: initial,
    equal: (other: ManifestBuilder): boolean => {
      const sameImportLength =
        other.data.imports.length === initial.imports.length;
      if (!sameImportLength) {
        return false;
      }
      const sameSchemeablesLength =
        Object.keys(initial.schemas.root).length ===
          Object.keys(other.data.schemas.root).length &&
        Object.keys(initial.schemas.definitions).length ===
          Object.keys(other.data.schemas.definitions).length;
      if (!sameSchemeablesLength) {
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
        const defaultClause =
          currImports[importStr.from].filter(isDefaultClause);
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
          }
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
