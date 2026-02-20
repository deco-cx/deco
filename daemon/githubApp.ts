import { create } from "@zaubrik/djwt";
import { join } from "@std/path";

const GITHUB_APP_ID = Deno.env.get("GITHUB_APP_ID");
const GITHUB_APP_PRIVATE_KEY = Deno.env.get("GITHUB_APP_PRIVATE_KEY");

export const GITHUB_APP_CONFIGURED = Boolean(
  GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY,
);

// Cache: installation IDs never change for a given owner/repo
const installationIdCache = new Map<string, number>();
// Cache: access tokens (50-minute TTL, tokens expire after 1 hour)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_TTL_MS = 50 * 60 * 1000;

/** Decode PEM base64 content to Uint8Array. */
function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Wrap a PKCS#1 (RSA PRIVATE KEY) DER blob in a PKCS#8 envelope so
 * crypto.subtle.importKey("pkcs8", …) can consume it.
 *
 * PKCS#8 structure:
 *   SEQUENCE {
 *     INTEGER 0,
 *     SEQUENCE { OID 1.2.840.113549.1.1.1, NULL },
 *     OCTET STRING { <pkcs1 bytes> }
 *   }
 */
function wrapPkcs1InPkcs8(pkcs1: Uint8Array): Uint8Array {
  // Static ASN.1 prefix: version(0) + rsaEncryption OID + NULL
  // deno-fmt-ignore
  const prefix = new Uint8Array([
    0x02, 0x01, 0x00,                                                 // INTEGER 0
    0x30, 0x0d,                                                        // SEQUENCE (13 bytes)
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID rsaEncryption
      0x05, 0x00,                                                      // NULL
  ]);

  const octetString = derEncode(0x04, pkcs1); // OCTET STRING wrapping pkcs1
  const inner = new Uint8Array(prefix.length + octetString.length);
  inner.set(prefix, 0);
  inner.set(octetString, prefix.length);

  return derEncode(0x30, inner); // outer SEQUENCE
}

/** DER-encode a tag + length + value. */
function derEncode(tag: number, value: Uint8Array): Uint8Array {
  const len = value.length;
  let header: Uint8Array;
  if (len < 0x80) {
    header = new Uint8Array([tag, len]);
  } else if (len < 0x100) {
    header = new Uint8Array([tag, 0x81, len]);
  } else {
    header = new Uint8Array([tag, 0x82, (len >> 8) & 0xff, len & 0xff]);
  }
  const result = new Uint8Array(header.length + len);
  result.set(header, 0);
  result.set(value, header.length);
  return result;
}

/** Convert a PEM private key (PKCS#1 or PKCS#8) to an ArrayBuffer suitable for crypto.subtle. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const bytes = pemToBytes(pem);
  if (isPkcs1) {
    return wrapPkcs1InPkcs8(bytes).buffer;
  }
  return bytes.buffer;
}

async function generateAppJWT(): Promise<string> {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error(
      "GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set",
    );
  }

  const keyData = pemToArrayBuffer(GITHUB_APP_PRIVATE_KEY);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 550,
    iss: GITHUB_APP_ID,
  };

  return await create({ alg: "RS256", typ: "JWT" }, payload, privateKey);
}

async function getInstallationId(
  owner: string,
  repo: string,
): Promise<number> {
  const key = `${owner}/${repo}`;
  const cached = installationIdCache.get(key);
  if (cached !== undefined) return cached;

  const jwt = await generateAppJWT();
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/installation`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to get installation for ${key}: ${response.status} ${body}`,
    );
  }

  const data = await response.json();
  const id = data.id as number;
  installationIdCache.set(key, id);
  return id;
}

async function getInstallationToken(
  installationId: number,
): Promise<string> {
  const jwt = await generateAppJWT();
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to create installation token: ${response.status} ${body}`,
    );
  }

  const data = await response.json();
  return data.token as string;
}

export async function getGitHubAppToken(
  owner: string,
  repo: string,
): Promise<string> {
  const key = `${owner}/${repo}`;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const installationId = await getInstallationId(owner, repo);
  const token = await getInstallationToken(installationId);

  tokenCache.set(key, {
    token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  return token;
}

export async function setupGitHubAppNetrc(
  owner: string,
  repo: string,
): Promise<string> {
  const token = await getGitHubAppToken(owner, repo);
  const home = Deno.env.get("HOME");
  if (!home) {
    throw new Error("HOME environment variable not set");
  }
  const netrcPath = join(home, ".netrc");
  const content = `machine github.com
login x-access-token
password ${token}
`;
  await Deno.writeTextFile(netrcPath, content);
  await Deno.chmod(netrcPath, 0o600);
  return token;
}
