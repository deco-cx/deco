try {
  await import("deco/daemon/main.ts");
} catch {
  await import("https://deno.land/x/deco/daemon/main.ts");
}
