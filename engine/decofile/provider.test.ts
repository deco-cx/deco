import { assertEquals } from "@std/assert";
import { shouldRespectDecoRelease } from "./provider.ts";

// The precedence that decides whether an explicit DECO_RELEASE wins over a baked
// `.deco/blocks` folder. The s3 target sets DECO_RELEASE=https://… and MUST win —
// else the pod cold-starts from the stale built-in folder.
Deno.test("shouldRespectDecoRelease: explicit remote/mounted releases win over a folder", () => {
  // s3 target (the fix) + plain http
  assertEquals(
    shouldRespectDecoRelease(
      "https://new-deco-decofiles.s3.us-west-2.amazonaws.com/decofiles/sites-x/abc/decofile.json",
    ),
    true,
  );
  assertEquals(shouldRespectDecoRelease("http://internal/decofile.json"), true);
  // pre-existing respected schemes
  assertEquals(shouldRespectDecoRelease("deconfig://site"), true);
  assertEquals(
    shouldRespectDecoRelease("file:///app/decofile/decofile.bin"),
    true,
  );
  assertEquals(
    shouldRespectDecoRelease("file:///app/decofile/decofile.json"),
    true,
  );
});

Deno.test("shouldRespectDecoRelease: unset or non-fronted scheme lets the folder win", () => {
  assertEquals(shouldRespectDecoRelease(undefined), false);
  assertEquals(
    shouldRespectDecoRelease("folder:///app/deco/.deco/blocks"),
    false,
  );
  assertEquals(shouldRespectDecoRelease("file:///some/other/path"), false);
});
