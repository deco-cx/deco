/**
 * Sandbox runner cache — opt-in S3-backed restore/snapshot for /deno-dir.
 *
 * Skipping the Deno module download on cold start saves ~5s per wake-up
 * on Deco/Storefront sites. The cache is *advisory*: every code path here
 * swallows errors and returns a no-op result. A failed restore must let
 * the runner fall back to the cold-start git clone + deno cache flow; a
 * failed snapshot must not affect the user-visible deploy.
 *
 * Config arrives via the /sandbox/deploy POST body (envs field) — NOT via
 * container env vars. The agent-sandbox operator rejects per-claim env when
 * a warm pool is in use, so the admin forwards cache hints through the
 * deploy body instead. The runner reads them from the request and passes
 * them into restoreCache/snapshotCache as explicit config.
 *
 * Auth: standard AWS SDK credential chain — Pod Identity in EKS supplies
 * credentials transparently via container metadata env vars.
 *
 * Layout in S3:
 *   s3://<bucket>/<site>/cache.tgz   (tar.gz of /deno-dir)
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.569.0";

const DENO_DIR = Deno.env.get("DENO_DIR") ?? "/deno-dir";

export interface CacheConfig {
  bucket?: string;
  region?: string;
  /** S3 key (path within bucket), e.g. "<site>/cache.tgz" */
  key?: string;
}

const isEnabled = (
  cfg: CacheConfig,
): cfg is Required<Pick<CacheConfig, "bucket" | "key">> & CacheConfig =>
  Boolean(cfg.bucket && cfg.key);

let cachedClient: S3Client | null = null;
let cachedRegion: string | null = null;
const client = (region: string): S3Client => {
  if (!cachedClient || cachedRegion !== region) {
    cachedClient = new S3Client({ region });
    cachedRegion = region;
  }
  return cachedClient;
};

export interface CacheResult {
  ok: boolean;
  ms: number;
  reason?: string;
}

const log = (msg: string) => console.log(`[sandbox-cache] ${msg}`);
const warn = (msg: string) => console.warn(`[sandbox-cache] ${msg}`);

/**
 * Build a CacheConfig from the envs map received via /sandbox/deploy.
 * Helper so callers don't have to know the env-var names.
 */
export function cacheConfigFromEnvs(
  envs?: Record<string, string>,
): CacheConfig {
  return {
    bucket: envs?.DECO_CACHE_S3_BUCKET,
    region: envs?.DECO_CACHE_S3_REGION ?? "us-west-2",
    key: envs?.DECO_CACHE_S3_KEY,
  };
}

/**
 * Restore the Deno-cache tarball from S3 into /deno-dir.
 * Streams S3 body directly into `tar -xzf -` without buffering in Deno.
 */
export async function restoreCache(cfg: CacheConfig): Promise<CacheResult> {
  if (!isEnabled(cfg)) return { ok: false, ms: 0, reason: "disabled" };
  const { bucket, key, region = "us-west-2" } = cfg;
  const start = performance.now();
  try {
    const resp = await client(region).send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = resp.Body;
    if (!body) {
      return { ok: false, ms: performance.now() - start, reason: "empty body" };
    }

    // Stream body → tar. tar reads the whole archive from stdin and unpacks
    // into /deno-dir directly. No intermediate file or buffer.
    const tar = new Deno.Command("tar", {
      args: ["-xzf", "-", "-C", "/"],
      stdin: "piped",
      stdout: "null",
      stderr: "piped",
    }).spawn();

    const stream =
      (body as { transformToWebStream: () => ReadableStream<Uint8Array> })
        .transformToWebStream();
    await stream.pipeTo(tar.stdin);
    const status = await tar.status;

    if (!status.success) {
      const stderr = await new Response(tar.stderr).text().catch(() => "");
      return {
        ok: false,
        ms: performance.now() - start,
        reason: `tar exit ${status.code}: ${stderr.slice(0, 200)}`,
      };
    }

    const ms = performance.now() - start;
    log(`restored cache from s3://${bucket}/${key} in ${ms.toFixed(0)}ms`);
    return { ok: true, ms };
  } catch (err) {
    const ms = performance.now() - start;
    // NoSuchKey on first wake-up of a site is normal — log at info level.
    const isMissing = (err as { name?: string }).name === "NoSuchKey" ||
      String(err).includes("NoSuchKey");
    const fmt = `${(err as Error).message ?? err}`;
    if (isMissing) {
      log(
        `no cache yet for s3://${bucket}/${key} (cold start, ${
          ms.toFixed(0)
        }ms)`,
      );
    } else {
      warn(`restore failed (${ms.toFixed(0)}ms): ${fmt}`);
    }
    return { ok: false, ms, reason: isMissing ? "missing" : fmt };
  }
}

/**
 * Tar /deno-dir and upload to S3. Best-effort — failures are logged and
 * swallowed so a failed snapshot can't break a successful deploy.
 *
 * Buffers the tarball in memory before upload (one-shot PUT). For a typical
 * site with ~200MB compressed cache this is fine; if cache sizes grow we
 * should switch to @aws-sdk/lib-storage's streaming Upload.
 */
export async function snapshotCache(cfg: CacheConfig): Promise<CacheResult> {
  if (!isEnabled(cfg)) return { ok: false, ms: 0, reason: "disabled" };
  const { bucket, key, region = "us-west-2" } = cfg;
  const start = performance.now();
  try {
    // Skip if /deno-dir doesn't exist or is empty
    const stat = await Deno.stat(DENO_DIR).catch(() => null);
    if (!stat?.isDirectory) {
      return { ok: false, ms: 0, reason: "no deno-dir" };
    }

    const tar = new Deno.Command("tar", {
      args: ["-czf", "-", "-C", "/", DENO_DIR.replace(/^\//, "")],
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    const body = new Uint8Array(await new Response(tar.stdout).arrayBuffer());
    const status = await tar.status;
    if (!status.success) {
      const stderr = await new Response(tar.stderr).text().catch(() => "");
      return {
        ok: false,
        ms: performance.now() - start,
        reason: `tar exit ${status.code}: ${stderr.slice(0, 200)}`,
      };
    }

    await client(region).send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/gzip",
      }),
    );

    const ms = performance.now() - start;
    log(
      `snapshotted ${
        (body.length / 1024 / 1024).toFixed(1)
      }MB → s3://${bucket}/${key} in ${ms.toFixed(0)}ms`,
    );
    return { ok: true, ms };
  } catch (err) {
    const ms = performance.now() - start;
    warn(
      `snapshot failed (${ms.toFixed(0)}ms): ${(err as Error).message ?? err}`,
    );
    return { ok: false, ms, reason: `${(err as Error).message ?? err}` };
  }
}
