// deno-lint-ignore-file
import { schemeableToJSONSchema } from "../../schema/schemeable.ts";
import { Schemeable } from "../../schema/transformv2.ts";
import * as J from "https://deno.land/x/jsonschema@v1.4.1/jsonschema.ts";

export interface DefaultImport {
  alias: string;
}
export interface NamedImport {
  import: string;
  as?: string;
}
export type ImportClause = DefaultImport | NamedImport;

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

export interface ManifestBuilder {
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
  imports: Import[];
  manifest: JSONObject;
  statements?: Statement[];
  exports: Export[];
  exportDefault?: ExportDefault;
  schemeables?: Schemeable[];
}

const stringifyStatement = (st: Statement): string => {
  return `${st.variable} = ${stringifyJS({ kind: "js", raw: st.assign })}`;
};

const stringifyImport = ({ clauses, from }: Import): string => {
  return `import ${clauses
    .map((clause) =>
      isDefaultClause(clause)
        ? `* as ${clause.alias}`
        : `{ ${clause.import} ${clause.as ? "as " + clause.as : ""}}`
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
export const stringify = ({
  imports,
  manifest,
  statements,
  exports,
  exportDefault,
  schemeables,
}: ManifestData): string => {
  const definitions = (schemeables ?? []).reduce((def, schemeable) => {
    const jsonSchema = J.print(schemeableToJSONSchema(schemeable));
    return { ...def, ...jsonSchema?.definitions };
  }, {});
  manifest["definitions"] = {
    kind: "js",
    raw: definitions,
  };
  return `
${imports.map(stringifyImport).join("\n")}

const manifest = ${stringifyObj(manifest)}

${exports.map(stringifyExport).join("\n")}
${statements ? statements.map(stringifyStatement).join("\n") : ""}
${exportDefault ? `export default ${exportDefault.variable.identifier}` : ""}
`;
};

export const newManifestBuilder = (initial: ManifestData): ManifestBuilder => {
  return {
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
        manifest: vals.reduce((man, [k, v]) => {
          const curr = man[key] ?? { kind: "obj", value: {} };
          if (isObj(curr)) {
            return {
              ...man,
              [key]: { ...curr, value: { ...curr.value, [k]: v } },
            };
          }
          return { ...man, [key]: v };
        }, initial.manifest),
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
