import { iteratorFrom, logs } from "./loggings/stream.ts";

export const runCmd = (...cmd: string[]) => {
  return async () => {
    const [runCmd, ...args] = cmd;
    const denoCmd = new Deno.Command(
      runCmd === "deno" ? Deno.execPath() : runCmd,
      {
        args,
        stdout: "piped",
        stderr: "piped",
      },
    );
    const child = denoCmd.spawn();
    logs.register(iteratorFrom(child.stdout, "info"));
    logs.register(iteratorFrom(child.stderr, "info"));
    const status = await child.status;

    if (!status.success) {
      return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 204 });
  };
};
