import { walk } from "@std/fs";
import { join, SEPARATOR } from "@std/path";
import { VERBOSE } from "../main.ts";

export interface GrepMatch {
  lineNumber: number;
  line: string;
  columnStart: number;
  columnEnd: number;
}

export interface GrepFileResult {
  filepath: string;
  matches: GrepMatch[];
}

export interface GrepResult {
  results: GrepFileResult[];
  total: number;
}

export interface GrepOptions {
  caseInsensitive?: boolean;
  isRegex?: boolean;
  includePattern?: string;
  excludePattern?: string;
  limit?: number;
  filepath?: string;
}

const shouldIgnore = (path: string) =>
  path.includes(`${SEPARATOR}.git`) ||
  path.includes(`${SEPARATOR}node_modules${SEPARATOR}`) ||
  path.includes(`${SEPARATOR}.deco`);

const browserPathFromSystem = (filepath: string) =>
  filepath.replace(Deno.cwd(), "").replaceAll(SEPARATOR, "/");

// Check if system grep is available
let isSystemGrepAvailable: boolean | null = null;

const checkSystemGrep = async (): Promise<boolean> => {
  if (isSystemGrepAvailable !== null) {
    return isSystemGrepAvailable;
  }

  try {
    const cmd = new Deno.Command("grep", {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    });
    const { success } = await cmd.output();
    isSystemGrepAvailable = success;
    return success;
  } catch {
    isSystemGrepAvailable = false;
    return false;
  }
};

const systemGrep = async (
  query: string,
  options: GrepOptions = {},
): Promise<GrepResult | null> => {
  try {
    const args = [
      "-n", // line numbers
      "-H", // show filenames
      "--color=never", // no color codes
    ];

    if (options.caseInsensitive) {
      args.push("-i");
    }

    if (!options.isRegex) {
      args.push("-F"); // fixed strings (literal)
    }

    // Add include/exclude patterns (only if not searching a specific file)
    const searchPath = options.filepath || ".";

    // Check if we're searching a specific file
    let isFile = false;
    if (options.filepath) {
      try {
        const fullPath = options.filepath.startsWith("/")
          ? options.filepath
          : join(Deno.cwd(), options.filepath);
        const stat = await Deno.stat(fullPath);
        isFile = stat.isFile;
      } catch {
        // Assume it's a directory/glob pattern if stat fails
      }
    }

    if (!isFile) {
      if (options.includePattern && options.includePattern !== "*") {
        args.push("--include", options.includePattern);
      }

      if (options.excludePattern) {
        args.push("--exclude", options.excludePattern);
      }

      // Standard exclusions for directory searches
      args.push(
        "--exclude-dir=.git",
        "--exclude-dir=node_modules",
        "--exclude-dir=.deco",
        "-r", // recursive
      );
    }

    args.push(query, searchPath);

    const cmd = new Deno.Command("grep", {
      args,
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "null",
    });

    const { stdout, success } = await cmd.output();

    if (!success) {
      return { results: [], total: 0 };
    }

    const output = new TextDecoder().decode(stdout);
    const lines = output.trim().split("\n").filter((line) => line.length > 0);

    const results: Map<string, GrepFileResult> = new Map();

    let total = 0;
    let fileCount = 0;

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      const secondColonIndex = line.indexOf(":", colonIndex + 1);

      if (colonIndex === -1 || secondColonIndex === -1) continue;

      const filepath = line.substring(0, colonIndex);
      const lineNumber = parseInt(
        line.substring(colonIndex + 1, secondColonIndex),
      );
      const content = line.substring(secondColonIndex + 1);

      const browserPath = browserPathFromSystem(filepath);

      if (!results.has(browserPath)) {
        if (fileCount >= (options.limit || 100)) {
          break;
        }
        results.set(browserPath, {
          filepath: browserPath,
          matches: [],
        });
        fileCount++;
      }

      const fileResult = results.get(browserPath)!;

      // Find match positions in the line
      let columnStart = 0;
      let columnEnd = content.length;

      if (options.isRegex) {
        const flags = options.caseInsensitive ? "gi" : "g";
        const pattern = new RegExp(query, flags);
        const match = pattern.exec(content);
        if (match) {
          columnStart = match.index;
          columnEnd = match.index + match[0].length;
        }
      } else {
        const searchTerm = options.caseInsensitive
          ? query.toLowerCase()
          : query;
        const searchLine = options.caseInsensitive
          ? content.toLowerCase()
          : content;
        const index = searchLine.indexOf(searchTerm);
        if (index !== -1) {
          columnStart = index;
          columnEnd = index + query.length;
        }
      }

      fileResult.matches.push({
        lineNumber,
        line: content,
        columnStart,
        columnEnd,
      });
      total++;
    }

    return {
      results: Array.from(results.values()),
      total,
    };
  } catch (error) {
    if (VERBOSE) {
      console.error("System grep failed:", error);
    }
    return null;
  }
};

const grepInFile = async (
  filepath: string,
  pattern: RegExp,
): Promise<GrepFileResult | null> => {
  try {
    const content = await Deno.readTextFile(filepath);
    const lines = content.split("\n");
    const matches: GrepMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;

      while ((match = pattern.exec(line)) !== null) {
        matches.push({
          lineNumber: i + 1,
          line: line,
          columnStart: match.index,
          columnEnd: match.index + match[0].length,
        });

        // If not global flag, break after first match
        if (!pattern.global) break;
      }
    }

    return matches.length > 0
      ? {
        filepath: browserPathFromSystem(filepath),
        matches,
      }
      : null;
  } catch (error) {
    // Skip files that can't be read (binary, permissions, etc)
    if (VERBOSE) {
      console.error(`Error reading file ${filepath}:`, error);
    }
    return null;
  }
};

const fallbackGrep = async (
  query: string,
  options: GrepOptions = {},
): Promise<GrepResult> => {
  let pattern: RegExp;

  if (options.isRegex) {
    const flags = options.caseInsensitive ? "gi" : "g";
    pattern = new RegExp(query, flags);
  } else {
    // Escape special regex characters for literal search
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = options.caseInsensitive ? "gi" : "g";
    pattern = new RegExp(escapedQuery, flags);
  }

  const results: GrepFileResult[] = [];
  let total = 0;

  const searchPath = options.filepath
    ? (options.filepath.startsWith("/")
      ? options.filepath
      : join(Deno.cwd(), options.filepath))
    : Deno.cwd();

  // Check if searchPath is a file or directory
  try {
    const stat = await Deno.stat(searchPath);
    if (stat.isFile) {
      // If it's a file, search only in that file
      const result = await grepInFile(searchPath, pattern);
      if (result) {
        results.push(result);
        total += result.matches.length;
      }
      return { results, total };
    }
  } catch (error) {
    // If stat fails, continue with directory walk
    if (VERBOSE) {
      console.error(`Error checking path ${searchPath}:`, error);
    }
  }

  const walker = walk(searchPath, {
    includeDirs: false,
    includeFiles: true,
    match: options.includePattern && options.includePattern !== "*"
      ? [new RegExp(options.includePattern)]
      : undefined,
    skip: options.excludePattern
      ? [new RegExp(options.excludePattern)]
      : undefined,
  });

  for await (const entry of walker) {
    if (shouldIgnore(entry.path)) {
      continue;
    }

    // Skip non-text files based on extension
    const ext = entry.path.split(".").pop()?.toLowerCase();
    const textExtensions = [
      "ts",
      "tsx",
      "js",
      "jsx",
      "json",
      "md",
      "txt",
      "css",
      "scss",
      "sass",
      "html",
      "htm",
      "xml",
      "yml",
      "yaml",
      "toml",
      "ini",
      "conf",
      "config",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "php",
      "sh",
      "bash",
      "zsh",
      "fish",
      "ps1",
      "sql",
      "graphql",
      "gql",
      "proto",
      "dockerfile",
      "makefile",
      "gitignore",
      "editorconfig",
      "env",
    ];

    if (ext && !textExtensions.includes(ext) && !entry.name.startsWith(".")) {
      continue;
    }

    const result = await grepInFile(entry.path, pattern);
    if (result) {
      results.push(result);
      total += result.matches.length;

      if (results.length >= (options.limit || 100)) {
        break;
      }
    }
  }

  return { results, total };
};

export const grep = async (
  query: string,
  options: GrepOptions = {},
): Promise<GrepResult> => {
  // Try system grep first
  const hasSystemGrep = await checkSystemGrep();

  if (hasSystemGrep) {
    if (VERBOSE) {
      console.log("Using system grep for query:", query);
    }

    const systemResult = await systemGrep(query, options);

    if (systemResult !== null) {
      return systemResult;
    }

    if (VERBOSE) {
      console.log(
        "System grep failed, falling back to JavaScript implementation",
      );
    }
  } else if (VERBOSE) {
    console.log("System grep not available, using JavaScript implementation");
  }

  // Fallback to JavaScript implementation
  return await fallbackGrep(query, options);
};
