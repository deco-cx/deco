import { join } from "std/path/mod.ts";
import { readAll } from "std/streams/mod.ts";

const fileCache: Map<string, { etag: string; data: Uint8Array; size: number }> =
  new Map();

async function generateEtag(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return hashHex;
}

async function readFile(root: string, pathname: string) {
  const filePath = join(root, pathname);
  try {
    const file = await Deno.open(filePath, { read: true });
    const data = await readAll(file);
    const etag = await generateEtag(data);
    const size = data.byteLength;
    fileCache.set(`/${pathname}`, { etag, data, size });
    file.close();
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
}

export async function initializeFileCache(root: string) {
  for await (const entry of Deno.readDir(root)) {
    if (entry.isFile) {
      await readFile(root, entry.name);
    }
  }
}

export function getFileFromCache(pathname: string) {
  return fileCache.get(pathname);
}
