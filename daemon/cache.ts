import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.946.0";

const ASSETS_BUCKET = Deno.env.get("ASSETS_BUCKET") || "deco-assets-storage";
const S3_REGION = Deno.env.get("ADMIN_S3_REGION") || "sa-east-1";
const CACHE_FILE = "cache.tar";

export async function downloadCache(site: string): Promise<void> {
  const accessKeyId = Deno.env.get("ADMIN_S3_ACCESS_KEY_ID") || "";
  const secretAccessKey = Deno.env.get("ADMIN_S3_SECRET_ACCESS_KEY") || "";

  if (!accessKeyId || !secretAccessKey) {
    console.warn("[cache] S3 credentials not set, skipping cache download");
    return;
  }

  const s3Key = `deco-sites/${site}/${CACHE_FILE}`;
  const localTar = `/tmp/${CACHE_FILE}`;
  const denoDir = Deno.env.get("DENO_DIR_RUN") || Deno.env.get("DENO_DIR") ||
    "/deno-dir";

  // deno-lint-ignore no-explicit-any -- Deno can't resolve AWS SDK's inherited send() generics
  const client: any = new S3Client({
    region: S3_REGION,
    credentials: { accessKeyId, secretAccessKey },
  });

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

  const { success } = await new Deno.Command("tar", {
    args: ["xf", localTar, "-C", denoDir],
  }).output();

  if (!success) {
    throw new Error(`tar extraction failed for ${localTar} -> ${denoDir}`);
  }

  await Deno.remove(localTar).catch(() => {});
}
