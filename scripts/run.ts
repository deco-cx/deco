// TODO: @gimenes use redirect instead of serving this file

const packageName = "@deco/deco";
const versions: { latest: string } = await fetch(
    `https://jsr.io/${packageName}/meta.json`,
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
await import(`jsr:${packageName}@${versions.latest}/scripts/run`);
