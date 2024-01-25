export async function exec(
  command: string,
): Promise<{ stdout: string; stderr: string }> {
  const commands = command.split("|").map((cmd) => cmd.trim());

  let lastStdout: Deno.CommandOutput | null = null;
  let lastProcess: Deno.ChildProcess | null = null;

  for (const cmd of commands) {
    const [cmdName, ...cmdArgs] = cmd.split(" ");

    const cmdOptions: Deno.RunOptions = {
      cmd: [cmdName, ...cmdArgs],
      stdout: "piped",
      stderr: "piped",
    };

    if (lastStdout) {
      cmdOptions.stdin = "piped";

      const cmdProcess = new Deno.Command(cmdName, {
        args: cmdArgs,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      }).spawn();
      const writer = cmdProcess.stdin!.getWriter();
      await writer.write(lastStdout.stdout);
      await writer.close();
      lastProcess = cmdProcess;
    } else {
      lastProcess = new Deno.Command(cmdName, {
        args: cmdArgs,
        stdout: "piped",
        stderr: "piped",
      }).spawn();
    }

    lastStdout = await lastProcess.output();
  }

  // Wait for the last process to complete
  await lastProcess!.status;

  return {
    stdout: new TextDecoder().decode(lastStdout!.stdout),
    stderr: new TextDecoder().decode(lastStdout!.stderr),
  };
}
