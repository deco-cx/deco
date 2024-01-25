export async function exec(
  command: string,
): Promise<{ stdout: string; stderr: string | null }> {
  const commands = command.split("|").map((cmd) => cmd.trim());

  let lastStdout: Deno.CommandOutput | null = null;
  let lastProcess: Deno.ChildProcess | null = null;

  for (const cmd of commands) {
    const [cmdName, ...cmdArgs] = cmd.split(" ");

    if (lastStdout) {
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
  const stdout = new TextDecoder().decode(lastStdout!.stdout);
  console.log(stdout);
  let stderr: string | null = null;
  if (lastStdout?.stderr) {
    stderr = new TextDecoder().decode(lastStdout!.stderr);
    console.error(stderr);
  }

  return {
    stdout,
    stderr,
  };
}
