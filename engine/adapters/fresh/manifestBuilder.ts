// deno-lint-ignore-file
import { schemeableToJSONSchema } from "$live/engine/schema/schemeable.ts";
import { Schemeable, schemeableEqual } from "$live/engine/schema/transform.ts";

export interface DefaultImport {
  alias: string;
}
export interface NamedImport {
  import: string;
  as?: string;
}
export type ImportClause = DefaultImport | NamedImport;

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

export interface Import {
  clauses: ImportClause[];
  from: string;
}
export interface FunctionCall {
  identifier: string;
  params: JSONValue[];
}

export interface Variable {
  identifier: string;
}

export interface JS {
  kind: "js";
  raw: FunctionCall | Variable | Record<string, unknown>;
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

export interface ManifestBuilder {
  withDefinitions: (def: Record<string, unknown>) => ManifestBuilder;
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
  addSchemeables: (...s: Schemeable[]) => ManifestBuilder;
  build(): string;
}

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
  manifestDef: Record<string, unknown>;
  imports: Import[];
  manifest: JSONObject;
  exports: Export[];
  statements?: Statement[];
  exportDefault?: ExportDefault;
  schemeables?: Schemeable[];
}

const stringifyStatement = (st: Statement): string => {
  return `${st.variable} = ${stringifyJS({ kind: "js", raw: st.assign })}`;
};

const stringifyImport = ({ clauses, from }: Import): string => {
  return `import ${
    clauses
      .map((clause) =>
        isDefaultClause(clause)
          ? `* as ${clause.alias}`
          : `{ ${clause.import} ${clause.as ? "as " + clause.as : ""}}`
      )
      .join(",")
  } from "${from}"`;
};

const stringifyObj = (obj: JSONObject): string => {
  return `{
    ${
    Object.entries(obj)
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
  schemeables,
  manifestDef,
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
  const definitions = (schemeables ?? []).reduce((def, schemeable) => {
    const [nDef, _] = schemeableToJSONSchema(def, schemeable);
    return nDef;
  }, {});
  manifest["definitions"] = {
    kind: "js",
    raw: { ...definitions, ...manifestDef },
  };
  return `// DO NOT EDIT. This file is generated by deco.
// This file SHOULD be checked into source version control.
// This file is automatically updated during development when running \`dev.ts\`.

import config from "./deno.json" assert { type: "json" };
${imports.map(stringifyImport).join("\n")}

const manifest = ${stringifyObj(manifest)}

${exports.map(stringifyExport).join("\n")}
${statements ? statements.map(stringifyStatement).join("\n") : ""}
${exportDefault ? `export default ${exportDefault.variable.identifier}` : ""}
`;
};

export const newManifestBuilder = (initial: ManifestData): ManifestBuilder => {
  return {
    withDefinitions: (def): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        manifestDef: { ...initial.manifestDef, ...def },
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
        other.data.schemeables?.length === initial.schemeables?.length;
      if (!sameSchemeablesLength) {
        return false;
      }
      for (let i = 0; i < initial.imports.length; i++) {
        const [importThis, importOther] = [
          initial.imports[i],
          other.data.imports[i],
        ];
        if (importThis.from !== importOther.from) {
          return false;
        }
        if (importThis.clauses.length !== importOther.clauses.length) {
          return false;
        }

        for (let k = 0; k < importThis.clauses.length; k++) {
          const [clauseThis, clauseOther] = [
            importThis.clauses[k],
            importOther.clauses[k],
          ];

          if (!equalClause(clauseThis, clauseOther)) {
            return false;
          }
        }
      }

      for (let j = 0; j < (initial.schemeables?.length ?? 0); j++) {
        const [thisSchemeable, otherSchemeable] = [
          initial.schemeables![j],
          other.data.schemeables![j],
        ];
        if (!schemeableEqual(thisSchemeable, otherSchemeable)) {
          return false;
        }
      }
      return true;
    },
    toJSONString: () => JSON.stringify(initial),
    build: () => stringify(initial),
    addSchemeables: (...s: Schemeable[]): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        schemeables: [...(initial.schemeables ?? []), ...s],
      });
    },
    addExportDefault: (dfs: ExportDefault): ManifestBuilder => {
      return newManifestBuilder({ ...initial, exportDefault: dfs });
    },
    addImports: (...imports: Import[]): ManifestBuilder => {
      return newManifestBuilder({
        ...initial,
        imports: [...initial.imports, ...imports],
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
