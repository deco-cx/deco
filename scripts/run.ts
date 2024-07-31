try {
  await import("deco/daemon/main.ts");
} catch {
  await import("https://cdn.jsdelivr.net/gh/deco-cx/deco@latest/daemon/main.ts");
}
