export async function exec(_cmd: string) {
  const [cmd, ...args] = _cmd.split(" ");
  const command = new Deno.Command(cmd, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const proc = command.spawn();

  const out = await proc.output();
  await proc.status;

  return new TextDecoder().decode(out.stdout);
}
