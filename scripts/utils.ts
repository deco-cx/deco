function splitCommand(command: string): string[] {
  const args: string[] = [];
  let currentArg = "";

  let insideQuotes = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (char === " " && !insideQuotes) {
      if (currentArg !== "") {
        args.push(currentArg);
        currentArg = "";
      }
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else {
      currentArg += char;
    }
  }

  if (currentArg !== "") {
    args.push(currentArg);
  }

  return args;
}
export async function exec(
  command: string,
): Promise<{ stdout: string; stderr: string | null }> {
  const commands = command.split("|").map((cmd) => cmd.trim());

  let lastStdout: Deno.CommandOutput | null = null;
  let lastProcess: Deno.ChildProcess | null = null;

  for (const cmd of commands) {
    const [cmdName, ...cmdArgs] = splitCommand(cmd);

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

export const jsrLatest = async (packageName: string, defaultsTo = "1") => {
  const versions: { latest: string } = await fetch(
    `https://jsr.io/${packageName}/meta.json`,
  ).then(
    (resp) => resp.json(),
  ).catch(() => {
    return {
      latest: defaultsTo,
    };
  });
  return `jsr:${packageName}@^${versions.latest}`;
};
