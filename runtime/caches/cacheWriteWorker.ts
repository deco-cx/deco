// Worker thread for cache write operations.
// Offloads SHA1 hashing, buffer combining, and FS writes from the main event loop.

const textEncoder = new TextEncoder();

const initializedDirs = new Set<string>();

function ensureCacheDir(dir: string) {
  if (initializedDirs.has(dir)) return;
  try {
    Deno.mkdirSync(dir, { recursive: true });
    initializedDirs.add(dir);
  } catch (err) {
    if (err instanceof Deno.errors.AlreadyExists) {
      initializedDirs.add(dir);
    } else {
      console.error("[cache-write-worker] failed to create cache dir:", err);
    }
  }
}

// --- SHA1 ---

const HEX_TABLE: string[] = Array.from(
  { length: 256 },
  (_, i) => i.toString(16).padStart(2, "0"),
);

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_TABLE[bytes[i]];
  }
  return hex;
}

async function sha1(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", textEncoder.encode(text));
  return bufferToHex(buf);
}

// --- Buffer generation ---

function generateCombinedBuffer(
  body: Uint8Array,
  headers: Uint8Array,
): Uint8Array {
  const hLen = headers.length;
  const buf = new Uint8Array(4 + hLen + body.length);
  buf[0] = hLen & 0xFF;
  buf[1] = (hLen >> 8) & 0xFF;
  buf[2] = (hLen >> 16) & 0xFF;
  buf[3] = (hLen >> 24) & 0xFF;
  buf.set(headers, 4);
  buf.set(body, 4 + hLen);
  return buf;
}

// --- Message handler ---

export interface CacheWriteMessage {
  cacheDir: string;
  url: string;
  cacheName: string;
  body: Uint8Array;
  headers: [string, string][];
}

console.log("[cache-write-worker] started");

self.onmessage = async (e: MessageEvent<CacheWriteMessage>) => {
  try {
    const { cacheDir, url, cacheName, body, headers } = e.data;

    ensureCacheDir(cacheDir);

    // SHA1 of the URL + cacheName (matches withCacheNamespace logic)
    const urlHash = await sha1(url);
    const cacheKey = `${urlHash}${cacheName}`;

    // Serialize headers to bytes
    const headersBytes = textEncoder.encode(JSON.stringify(headers));

    // Combine into single buffer
    const buffer = generateCombinedBuffer(body, headersBytes);

    // Write to filesystem
    const filePath = `${cacheDir}/${cacheKey}`;
    await Deno.writeFile(filePath, buffer);
  } catch (err) {
    console.error("[cache-write-worker] error:", err);
  }
};
