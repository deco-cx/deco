import { _compress, _decompress } from "./redis.ts";

// Simulates a realistic cache payload: JSON with a large HTML body (5-10 KB range)
// and typical response headers. Repeated to hit different size tiers.
function makePayload(sizeKb: number): string {
  const body = `<html><body>${"<div class='product'><img src='https://cdn.bagaggio.com.br/img.jpg'/><h2>Mala de Viagem Premium</h2><p>R$ 1.299,00</p><span>Em estoque</span></div>".repeat(Math.ceil((sizeKb * 1024) / 180))}`;
  return JSON.stringify({
    body,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-response-time": "42ms",
      "vary": "Accept-Encoding",
    },
    status: 200,
  });
}

const CODEC_GZIP = 0x01;
const CODEC_DEFLATE = 0x02;
const CODEC_LZ4 = 0x03;
const CODEC_ZSTD = 0x04;

const payload10kb = makePayload(10);
const payload100kb = makePayload(100);
const payload1mb = makePayload(1000);

// Pre-compress for decompression benchmarks
const [gz10, df10, lz10, zs10] = await Promise.all([
  _compress(payload10kb, CODEC_GZIP),
  _compress(payload10kb, CODEC_DEFLATE),
  _compress(payload10kb, CODEC_LZ4),
  _compress(payload10kb, CODEC_ZSTD),
]);
const [gz1mb, df1mb, lz1mb, zs1mb] = await Promise.all([
  _compress(payload1mb, CODEC_GZIP),
  _compress(payload1mb, CODEC_DEFLATE),
  _compress(payload1mb, CODEC_LZ4),
  _compress(payload1mb, CODEC_ZSTD),
]);

// ─── Compression ratios (informational, printed once) ────────────────────────
const sizes = [
  ["10 KB", payload10kb],
  ["100 KB", payload100kb],
  ["1 MB", payload1mb],
] as const;

console.log("\n── Compression ratios ──────────────────────────────────────────");
for (const [label, payload] of sizes) {
  const raw = new TextEncoder().encode(payload).length;
  const results = await Promise.all([
    _compress(payload, CODEC_GZIP).then((c) => ({ name: "gzip   ", size: c.length })),
    _compress(payload, CODEC_DEFLATE).then((c) => ({ name: "deflate", size: c.length })),
    _compress(payload, CODEC_LZ4).then((c) => ({ name: "lz4    ", size: c.length })),
    _compress(payload, CODEC_ZSTD).then((c) => ({ name: "zstd/1 ", size: c.length })),
  ]);
  console.log(`\n${label} (raw: ${(raw / 1024).toFixed(1)} KB)`);
  for (const { name, size } of results) {
    const pct = ((1 - size / raw) * 100).toFixed(1);
    console.log(`  ${name}  ${(size / 1024).toFixed(1).padStart(7)} KB  (${pct}% smaller)`);
  }
}
console.log("\n── Benchmarks ──────────────────────────────────────────────────");

// ─── Compress 10 KB ──────────────────────────────────────────────────────────
Deno.bench({ name: "compress   gzip    10KB", group: "compress-10kb" }, async () => {
  await _compress(payload10kb, CODEC_GZIP);
});
Deno.bench({ name: "compress   deflate 10KB", group: "compress-10kb" }, async () => {
  await _compress(payload10kb, CODEC_DEFLATE);
});
Deno.bench({ name: "compress   lz4     10KB", group: "compress-10kb" }, async () => {
  await _compress(payload10kb, CODEC_LZ4);
});
Deno.bench({ name: "compress   zstd/1  10KB", group: "compress-10kb", baseline: true }, async () => {
  await _compress(payload10kb, CODEC_ZSTD);
});

// ─── Compress 1 MB ───────────────────────────────────────────────────────────
Deno.bench({ name: "compress   gzip    1MB", group: "compress-1mb" }, async () => {
  await _compress(payload1mb, CODEC_GZIP);
});
Deno.bench({ name: "compress   deflate 1MB", group: "compress-1mb" }, async () => {
  await _compress(payload1mb, CODEC_DEFLATE);
});
Deno.bench({ name: "compress   lz4     1MB", group: "compress-1mb" }, async () => {
  await _compress(payload1mb, CODEC_LZ4);
});
Deno.bench({ name: "compress   zstd/1  1MB", group: "compress-1mb", baseline: true }, async () => {
  await _compress(payload1mb, CODEC_ZSTD);
});

// ─── Decompress 10 KB ────────────────────────────────────────────────────────
Deno.bench({ name: "decompress gzip    10KB", group: "decompress-10kb" }, async () => {
  await _decompress(gz10);
});
Deno.bench({ name: "decompress deflate 10KB", group: "decompress-10kb" }, async () => {
  await _decompress(df10);
});
Deno.bench({ name: "decompress lz4     10KB", group: "decompress-10kb" }, async () => {
  await _decompress(lz10);
});
Deno.bench({ name: "decompress zstd/1  10KB", group: "decompress-10kb", baseline: true }, async () => {
  await _decompress(zs10);
});

// ─── Decompress 1 MB ─────────────────────────────────────────────────────────
Deno.bench({ name: "decompress gzip    1MB", group: "decompress-1mb" }, async () => {
  await _decompress(gz1mb);
});
Deno.bench({ name: "decompress deflate 1MB", group: "decompress-1mb" }, async () => {
  await _decompress(df1mb);
});
Deno.bench({ name: "decompress lz4     1MB", group: "decompress-1mb" }, async () => {
  await _decompress(lz1mb);
});
Deno.bench({ name: "decompress zstd/1  1MB", group: "decompress-1mb", baseline: true }, async () => {
  await _decompress(zs1mb);
});
