import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.946.0";

const ASSETS_BUCKET = Deno.env.get("ASSETS_BUCKET") || "deco-assets-storage";
const S3_REGION = Deno.env.get("ADMIN_S3_REGION") || "sa-east-1";
const CACHE_FILE_ZSTD = "cache.tar.zst";
const CACHE_FILE_PLAIN = "cache.tar";

export async function downloadCache(site: string): Promise<void> {
  const accessKeyId = Deno.env.get("ADMIN_S3_ACCESS_KEY_ID") || "";
  const secretAccessKey = Deno.env.get("ADMIN_S3_SECRET_ACCESS_KEY") || "";

  if (!accessKeyId || !secretAccessKey) {
    console.warn("[cache] S3 credentials not set, skipping cache download");
    return;
  }

  const denoDir = Deno.env.get("DENO_DIR_RUN");
  if (!denoDir) {
    console.warn("[cache] DENO_DIR_RUN not set, skipping cache download");
    return;
  }

  // deno-lint-ignore no-explicit-any -- Deno can't resolve AWS SDK's inherited send() generics
  const client: any = new S3Client({
    region: S3_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Try zstd first, fallback to plain tar for old sites
  let cacheFile: string;
  try {
    cacheFile = CACHE_FILE_ZSTD;
    await downloadAndExtract(client, site, cacheFile, denoDir);
    return;
  } catch {
    console.log("[cache] cache.tar.zst not found, trying cache.tar fallback");
  }

  cacheFile = CACHE_FILE_PLAIN;
  await downloadAndExtract(client, site, cacheFile, denoDir);
}

async function downloadAndExtract(
  client: any,
  site: string,
  cacheFile: string,
  denoDir: string,
): Promise<void> {
  const s3Key = `deco-sites/${site}/${cacheFile}`;
  const localTar = `/tmp/${cacheFile}`;

  const resp = await client.send(
    new GetObjectCommand({ Bucket: ASSETS_BUCKET, Key: s3Key }),
  );

  const stream = resp.Body;
  if (!stream) {
    throw new Error(`Empty response body for ${s3Key}`);
  }

  const file = await Deno.open(localTar, {
    write: true,
    create: true,
    truncate: true,
  });

  await new Promise<void>((resolve, reject) => {
    stream.on("data", async (chunk: Uint8Array) => {
      try {
        await file.write(chunk);
      } catch (error: unknown) {
        await file.close();
        reject(error);
      }
    });

    stream.on("error", async (error: unknown) => {
      await file.close();
      reject(error);
    });

    stream.on("end", async () => {
      await file.close();
      resolve();
    });
  });

  const isZstd = cacheFile.endsWith(".zst");
  const extractCmd = isZstd
    ? new Deno.Command("sh", {
      args: [
        "-c",
        `zstd -d "${localTar}" --stdout | tar xf - -C "${denoDir}"`,
      ],
    })
    : new Deno.Command("tar", {
      args: ["xf", localTar, "-C", denoDir],
    });

  const { success } = await extractCmd.output();

  if (!success) {
    throw new Error(`tar extraction failed for ${localTar} -> ${denoDir}`);
  }

  await Deno.remove(localTar).catch(() => {});
}
