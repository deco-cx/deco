import { assert, assertEquals } from "@std/assert";
import {
  applyDraftCookie,
  clearDraftCache,
  DEFAULT_PREVIEW_API_DOMAINS,
  draftPointerFromRequest,
  isDraftHostAllowed,
  isDraftPreviewEnabled,
  parseDraftPointer,
  previewApiOriginForHost,
  resolveDraftDecofile,
  resolveDraftForRequest,
  setDraftPreviewHosts,
} from "./draft.ts";

const ENV_ON = { DECO_ALLOWED_PREVIEW_HOSTS: "preview.example" };

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

// Canonical Studio decofile-API pointer prefix (authority + path, no version).
const P = "studio.decocms.com/api/fila/decofile/vm-1/main?token=tok.abc";

Deno.test("parseDraftPointer", async (t) => {
  await t.step(
    "parses <authority><path>@<version>, lowercasing authority",
    () => {
      assertEquals(
        parseDraftPointer(
          "Studio.decocms.com/api/fila/decofile/vm-1/main?token=Tok.abc@8c1d44e",
        ),
        {
          host: "studio.decocms.com",
          path: "/api/fila/decofile/vm-1/main?token=Tok.abc",
          version: "8c1d44e",
        },
      );
    },
  );

  await t.step("keeps an explicit port, incl. bare localhost", () => {
    assertEquals(parseDraftPointer("localhost:4000/api/o/decofile/m/b@v1"), {
      host: "localhost:4000",
      path: "/api/o/decofile/m/b",
      version: "v1",
    });
  });

  await t.step(
    "splits on the LAST @ — earlier @ fails, never half-reads",
    () => {
      assertEquals(parseDraftPointer("a.example/x@y/z@v1"), null);
      assertEquals(parseDraftPointer("a@b@c"), null);
    },
  );

  await t.step(
    "requires a rooted path — authority-only tokens are gone",
    () => {
      assertEquals(
        parseDraftPointer("abc.preview-studio.decocms.com@v1"),
        null,
      );
      assertEquals(parseDraftPointer("a.example@v1"), null);
    },
  );

  await t.step("rejects anything escaping the authority or path", () => {
    assertEquals(parseDraftPointer("https://evil.example/x@v1"), null);
    assertEquals(parseDraftPointer("a.example:80:80/x@v1"), null);
    assertEquals(parseDraftPointer("a.example:abc/x@v1"), null);
    assertEquals(parseDraftPointer(".leading.dot/x@v1"), null);
    assertEquals(parseDraftPointer("a.example/x#frag@v1"), null);
    assertEquals(parseDraftPointer("a.example/x y@v1"), null);
  });

  await t.step("validates the version charset — it becomes a cache key", () => {
    assertEquals(parseDraftPointer("a.example/x@"), null);
    assertEquals(parseDraftPointer(`a.example/x@${"x".repeat(65)}`), null);
    assertEquals(parseDraftPointer("a.example/x@v 1"), null);
    assertEquals(parseDraftPointer(null), null);
  });
});

Deno.test("previewApiOriginForHost", async (t) => {
  await t.step("admits authorities under the default deco domains", () => {
    assertEquals(
      previewApiOriginForHost("studio.decocms.com", {}),
      "https://studio.decocms.com",
    );
    assertEquals(
      previewApiOriginForHost("abc.preview-studio.decocms.com", {}),
      "https://abc.preview-studio.decocms.com",
    );
    assertEquals(
      previewApiOriginForHost("localhost:4000", {}),
      "http://localhost:4000",
    );
    assertEquals(
      previewApiOriginForHost("local.studio.decocms.com:4420", {}),
      "https://local.studio.decocms.com:4420",
    );
    assertEquals(
      previewApiOriginForHost("abc.localhost:60534", {}),
      "http://abc.localhost:60534",
    );
  });

  await t.step("rejects hosts outside the domains", () => {
    assertEquals(previewApiOriginForHost("evil.example", {}), null);
    assertEquals(previewApiOriginForHost("evil-decocms.com", {}), null);
    assertEquals(previewApiOriginForHost("decocms.com", {}), null);
  });

  await t.step("allows an explicit port only for local entries", () => {
    assertEquals(previewApiOriginForHost("studio.decocms.com:8500", {}), null);
    assertEquals(
      previewApiOriginForHost("abc.preview-studio.decocms.com:8500", {}),
      null,
    );
  });

  await t.step("honours a configured override instead of the defaults", () => {
    const env = { DECO_PREVIEW_API_DOMAINS: ".staging.example" };
    assertEquals(
      previewApiOriginForHost("abc.staging.example", env),
      "https://abc.staging.example",
    );
    assertEquals(previewApiOriginForHost("studio.decocms.com", env), null);
  });
});

Deno.test("gating", async (t) => {
  await t.step("on iff an allowed host is configured", () => {
    assertEquals(isDraftPreviewEnabled(ENV_ON), true);
    assertEquals(isDraftPreviewEnabled({}), false);
  });

  await t.step("matches request hosts verbatim, port + case", () => {
    const env = { DECO_ALLOWED_PREVIEW_HOSTS: "fila.vtex.app, localhost:3100" };
    assertEquals(isDraftHostAllowed("FILA.VTEX.APP", env), true);
    assertEquals(isDraftHostAllowed("localhost:3100", env), true);
    assertEquals(isDraftHostAllowed("fila.com.br", env), false);
    assertEquals(isDraftHostAllowed("localhost", env), false);
    assertEquals(isDraftHostAllowed(null, env), false);
    assertEquals(isDraftHostAllowed("fila.vtex.app", {}), false);
  });
});

Deno.test("resolveDraftDecofile", async (t) => {
  await t.step("fetches the token's path on its validated origin", async () => {
    clearDraftCache();
    const calls: string[] = [];
    const blocks = await resolveDraftDecofile({
      pointer: `${P}@v1`,
      env: ENV_ON,
      fetchImpl: ((url: string) => {
        calls.push(String(url));
        return Promise.resolve(
          jsonResponse({ "pages-home": { title: "draft" } }),
        );
      }) as unknown as typeof fetch,
    });
    assertEquals(blocks, { "pages-home": { title: "draft" } });
    assertEquals(calls, [
      "https://studio.decocms.com/api/fila/decofile/vm-1/main?token=tok.abc&v=v1",
    ]);
  });

  await t.step("is inert without a host allowlist — no fetch", async () => {
    clearDraftCache();
    let called = false;
    const blocks = await resolveDraftDecofile({
      pointer: `${P}@v1`,
      env: {},
      fetchImpl: (() => {
        called = true;
        return Promise.resolve(jsonResponse({}));
      }) as unknown as typeof fetch,
    });
    assertEquals(blocks, null);
    assertEquals(called, false);
  });

  await t.step("origin validation runs before the cache", async () => {
    clearDraftCache();
    let called = false;
    const fetchImpl = (() => {
      called = true;
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;
    assertEquals(
      await resolveDraftDecofile({
        pointer: "abc.evil.example/x@v1",
        env: ENV_ON,
        fetchImpl,
      }),
      null,
    );
    assertEquals(called, false);
    await resolveDraftDecofile({ pointer: `${P}@vX`, env: ENV_ON, fetchImpl });
    assertEquals(called, true);
    assertEquals(
      await resolveDraftDecofile({
        pointer: "abc.evil.example/x@vX",
        env: ENV_ON,
        fetchImpl,
      }),
      null,
    );
  });

  await t.step("caches by version — one fetch per version", async () => {
    clearDraftCache();
    let fetches = 0;
    const fetchImpl = (() => {
      fetches++;
      return Promise.resolve(jsonResponse({ n: fetches }));
    }) as unknown as typeof fetch;
    const a = await resolveDraftDecofile({
      pointer: `${P}@v1`,
      env: ENV_ON,
      fetchImpl,
    });
    const b = await resolveDraftDecofile({
      pointer: `${P}@v1`,
      env: ENV_ON,
      fetchImpl,
    });
    assertEquals(fetches, 1);
    assert(b === a);
    await resolveDraftDecofile({ pointer: `${P}@v2`, env: ENV_ON, fetchImpl });
    assertEquals(fetches, 2);
  });

  await t.step(
    "does not collide two sources sharing a version label",
    async () => {
      clearDraftCache();
      const bodies: Record<string, unknown> = {
        "studio.decocms.com/api/a/decofile/vm/main": { src: "a" },
        "studio.decocms.com/api/b/decofile/vm/main": { src: "b" },
      };
      const fetchImpl = ((url: string) => {
        const u = new URL(String(url));
        return Promise.resolve(jsonResponse(bodies[`${u.host}${u.pathname}`]));
      }) as unknown as typeof fetch;
      const a = await resolveDraftDecofile({
        pointer: "studio.decocms.com/api/a/decofile/vm/main@v1",
        env: ENV_ON,
        fetchImpl,
      });
      const b = await resolveDraftDecofile({
        pointer: "studio.decocms.com/api/b/decofile/vm/main@v1",
        env: ENV_ON,
        fetchImpl,
      });
      // Same version label "v1", different path → must NOT serve a's cache for b.
      assertEquals(a, { src: "a" });
      assertEquals(b, { src: "b" });
    },
  );

  await t.step("bounds the cache (cap 3)", async () => {
    clearDraftCache();
    let fetches = 0;
    const fetchImpl = (() => {
      fetches++;
      return Promise.resolve(jsonResponse({ n: fetches }));
    }) as unknown as typeof fetch;
    for (const v of ["v1", "v2", "v3", "v4"]) {
      await resolveDraftDecofile({
        pointer: `${P}@${v}`,
        env: ENV_ON,
        fetchImpl,
      });
    }
    assertEquals(fetches, 4);
    await resolveDraftDecofile({ pointer: `${P}@v1`, env: ENV_ON, fetchImpl });
    assertEquals(fetches, 5); // v1 evicted — re-fetch, never stale
    await resolveDraftDecofile({ pointer: `${P}@v4`, env: ENV_ON, fetchImpl });
    assertEquals(fetches, 5); // v4 resident
  });

  await t.step(
    "degrades to published on unreachable / non-2xx / bad json",
    async () => {
      for (
        const fetchImpl of [
          () => Promise.reject(new Error("ECONNREFUSED")),
          () => Promise.resolve(new Response("nope", { status: 404 })),
          () =>
            Promise.resolve(
              new Response("<html>not json</html>", {
                status: 200,
                headers: { "content-type": "text/html" },
              }),
            ),
        ]
      ) {
        clearDraftCache();
        assertEquals(
          await resolveDraftDecofile({
            pointer: `${P}@v1`,
            env: ENV_ON,
            fetchImpl: fetchImpl as unknown as typeof fetch,
          }),
          null,
        );
      }
    },
  );
});

Deno.test("DEFAULT_PREVIEW_API_DOMAINS is pinned", () => {
  assertEquals(DEFAULT_PREVIEW_API_DOMAINS, [
    "local.studio.decocms.com",
    "localhost",
    "127.0.0.1",
    ".localhost",
    ".decocms.com",
  ]);
});

Deno.test("site-block preview hosts", async (t) => {
  await t.step("enables the feature from the site block alone", () => {
    setDraftPreviewHosts(["fila.vtex.app", "LOCALHOST:3100", 42, "  "]);
    try {
      assertEquals(isDraftPreviewEnabled({}), true);
      assertEquals(isDraftHostAllowed("fila.vtex.app", {}), true);
      assertEquals(isDraftHostAllowed("localhost:3100", {}), true);
      assertEquals(isDraftHostAllowed("evil.example", {}), false);
    } finally {
      setDraftPreviewHosts([]);
    }
  });

  await t.step("env REPLACES the block hosts when set", () => {
    setDraftPreviewHosts(["fila.vtex.app"]);
    try {
      const env = { DECO_ALLOWED_PREVIEW_HOSTS: "other.example" };
      assertEquals(isDraftHostAllowed("other.example", env), true);
      assertEquals(isDraftHostAllowed("fila.vtex.app", env), false);
    } finally {
      setDraftPreviewHosts([]);
    }
  });
});

Deno.test("draftPointerFromRequest", async (t) => {
  await t.step("reads the __deco_draft cookie", () => {
    const req = new Request(
      "https://preview.example/deco/invoke/site/loaders/x.ts",
      {
        headers: {
          cookie: "a=1; __deco_draft=abc.preview-studio.decocms.com@v1; b=2",
        },
      },
    );
    assertEquals(
      draftPointerFromRequest(req),
      "abc.preview-studio.decocms.com@v1",
    );
  });

  await t.step("lets ?__draft= win over the cookie", () => {
    const req = new Request("https://preview.example/p?__draft=h@v2", {
      headers: { cookie: "__deco_draft=h@v1" },
    });
    assertEquals(draftPointerFromRequest(req), "h@v2");
  });

  await t.step("returns null on ?__draft=off even with a cookie", () => {
    const req = new Request("https://preview.example/p?__draft=off", {
      headers: { cookie: "__deco_draft=h@v1" },
    });
    assertEquals(draftPointerFromRequest(req), null);
  });

  await t.step("returns null with neither param nor cookie", () => {
    assertEquals(
      draftPointerFromRequest(new Request("https://preview.example/p")),
      null,
    );
  });

  await t.step(
    "returns null (never throws) on a malformed cookie value",
    () => {
      const req = new Request("https://preview.example/p", {
        headers: { cookie: "__deco_draft=%E0%A4%A" },
      });
      assertEquals(draftPointerFromRequest(req), null);
    },
  );
});

Deno.test("resolveDraftForRequest", async (t) => {
  const ENV = { DECO_ALLOWED_PREVIEW_HOSTS: "preview.example" };
  function invokeReq(host = "preview.example"): Request {
    return new Request(
      "https://preview.example/deco/invoke/site/loaders/x.ts",
      {
        method: "POST",
        headers: {
          "x-forwarded-host": host,
          cookie: `__deco_draft=${encodeURIComponent(`${P}@v1`)}`,
        },
      },
    );
  }

  await t.step(
    "binds the draft when host allowed and pointer resolves",
    async () => {
      clearDraftCache();
      const fetchImpl = (() =>
        Promise.resolve(
          jsonResponse({ "site/x": { value: "draft" } }),
        )) as unknown as typeof fetch;
      assertEquals(
        await resolveDraftForRequest(invokeReq(), { env: ENV, fetchImpl }),
        {
          "site/x": { value: "draft" },
        },
      );
    },
  );

  await t.step(
    "is inert with no allowlist — never touches the network",
    async () => {
      clearDraftCache();
      let called = false;
      const fetchImpl = (() => {
        called = true;
        return Promise.resolve(jsonResponse({}));
      }) as unknown as typeof fetch;
      assertEquals(
        await resolveDraftForRequest(invokeReq(), { env: {}, fetchImpl }),
        null,
      );
      assertEquals(called, false);
    },
  );

  await t.step("refuses a disallowed request host", async () => {
    clearDraftCache();
    let called = false;
    const fetchImpl = (() => {
      called = true;
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;
    assertEquals(
      await resolveDraftForRequest(invokeReq("evil.example"), {
        env: ENV,
        fetchImpl,
      }),
      null,
    );
    assertEquals(called, false);
  });
});

Deno.test("applyDraftCookie", async (t) => {
  await t.step("sets the __deco_draft cookie for an allowed host", () => {
    const headers = new Headers();
    applyDraftCookie(
      new Request(
        `https://preview.example/p?__draft=${encodeURIComponent(`${P}@v1`)}`,
        {
          headers: { host: "preview.example" },
        },
      ),
      headers,
      ENV_ON,
    );
    const setCookie = headers.get("set-cookie") ?? "";
    assert(setCookie.includes("__deco_draft="));
    assert(setCookie.includes("HttpOnly"));
  });

  await t.step("clears the cookie on ?__draft=off, on any host", () => {
    const headers = new Headers();
    applyDraftCookie(
      new Request("https://prod.example/p?__draft=off", {
        headers: { host: "prod.example" },
      }),
      headers,
      ENV_ON,
    );
    const setCookie = headers.get("set-cookie") ?? "";
    assert(setCookie.includes("__deco_draft="));
    assert(
      setCookie.toLowerCase().includes("max-age=0") ||
        setCookie.includes("Expires"),
    );
  });

  await t.step("does nothing without a __draft param", () => {
    const headers = new Headers();
    applyDraftCookie(
      new Request("https://preview.example/p", {
        headers: { host: "preview.example" },
      }),
      headers,
      ENV_ON,
    );
    assertEquals(headers.get("set-cookie"), null);
  });

  await t.step("does not set a cookie on a non-allowed host", () => {
    const headers = new Headers();
    applyDraftCookie(
      new Request(
        `https://evil.example/p?__draft=${encodeURIComponent(`${P}@v1`)}`,
        {
          headers: { host: "evil.example" },
        },
      ),
      headers,
      ENV_ON,
    );
    assertEquals(headers.get("set-cookie"), null);
  });
});
