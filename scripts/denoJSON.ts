export interface DenoJSON {
    name?: string;
    version?: string;
    exports?: Record<string, string>;
    publish: Publish;
    tasks?: Record<string, string>;
    githooks?: Record<string, string>;
    fmt?: Fmt;
    scopes?: Record<string, string>;
    imports?: Record<string, string>;
    compilerOptions?: CompilerOptions;
}

export interface Publish {
    exclude: string[];
}

export interface Fmt {
    files: Files;
}

export interface Files {
    exclude: string[];
}

export interface CompilerOptions {
    jsx: string;
    jsxImportSource: string;
}
