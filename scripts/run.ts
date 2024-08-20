// TODO: @gimenes use redirect instead of serving this file

const packageName = "@deco/deco";
const timeout = new AbortController();
const timeoutId = setTimeout(() => timeout.abort(), 2_000);

const start = performance.now();
const versions: { latest: string } = await fetch(
  `https://jsr.io/${packageName}/meta.json`,
  { signal: timeout.signal },
).then(
  (resp) => resp.json(),
).catch((err) => {
  console.warn(
    `could not fetch ${packageName} meta.json`,
    err,
    "falling back to major specifier",
  );
  return { latest: "1" };
});
console.log(
  `%cfetched ${versions.latest} version of ${packageName} in ${
    (performance.now() - start).toFixed(0)
  }ms`,
  "color: gray",
);
clearTimeout(timeoutId);

await import(`jsr:${packageName}@${versions.latest}/scripts/run`);
