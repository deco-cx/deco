import { join } from "../../compat/std-path.ts";
import { fs } from "../../compat/mod.ts";

const fileCache: Map<string, { etag: string; data: Uint8Array; size: number }> =
  new Map();

async function generateEtag(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data as BufferSource,
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return hashHex;
}

async function readFile(root: string, pathname: string) {
  const filePath = join(root, pathname);
  try {
    const data = await fs.readFile(filePath);
    const etag = await generateEtag(data);
    const size = data.byteLength;
    fileCache.set(`/${pathname}`, { etag, data, size });
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
}

export async function initializeFileCache(root: string) {
  for await (const entry of fs.readDir(root)) {
    if (entry.isFile) {
      await readFile(root, entry.name);
    }
  }
}

export function getFileFromCache(pathname: string) {
  return fileCache.get(pathname);
}
