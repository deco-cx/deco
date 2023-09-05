import { join } from "https://deno.land/std@0.201.0/path/mod.ts";
import { mergeReadableStreams } from "https://deno.land/std@0.201.0/streams/merge_readable_streams.ts";

const runModule = (module: string, ...args: string[]): Deno.Command => {
  return new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--config",
      join(Deno.cwd(), "deno.json"),
      import.meta.resolve(module),
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  });
};
const printStdout = async (process: Deno.ChildProcess): Promise<void> => {
  // example of combining stdout and stderr while sending to a file
  const joined = mergeReadableStreams(
    process.stdout,
    process.stderr,
  );

  await joined.pipeTo(Deno.stdout.writable, { preventClose: true });
};

const serveTsCommand = runModule("./serve.ts", ...Deno.args);
const bundleCmd = runModule("./bundle.ts");

while (true) {
  const it = Deno.watchFs(Deno.cwd(), { recursive: true });
  const serve = serveTsCommand.spawn();
  const stream = printStdout(serve);

  for await (const event of it) {
    if (
      event.paths.some((path) => path.endsWith(".tsx") || path.endsWith(".ts"))
    ) {
      break;
    }
  }

  serve.kill();
  await stream;
  await serve.status;
  const bundle = bundleCmd.spawn();
  await printStdout(bundle);
  await bundle.status;
}
