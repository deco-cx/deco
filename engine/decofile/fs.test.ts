import { assertEquals } from "@std/assert";
import { brotliCompressSync } from "node:zlib";
import { encodeBase64 } from "@std/encoding/base64";
import { newFsProviderFromPath } from "./fs.ts";

Deno.test("reads a brotli + base64 decofile.bin (the production format)", async () => {
  const decofile = {
    site: { __resolveType: "site/apps/site.ts" },
    "page-home": { name: "Home", path: "/" },
  };
  const dir = await Deno.makeTempDir();
  const path = `${dir}/decofile.bin`;
  await Deno.writeTextFile(
    path,
    encodeBase64(
      brotliCompressSync(new TextEncoder().encode(JSON.stringify(decofile))),
    ),
  );
  const provider = newFsProviderFromPath(path);
  try {
    assertEquals(await provider.state(undefined), decofile);
  } finally {
    provider.dispose?.();
    await Deno.remove(dir, { recursive: true });
  }
});
