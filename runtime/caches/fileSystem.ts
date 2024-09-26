const FILE_SYSTEM_CACHE_DIRECTORY = "/tmp";

const hasWritePerm = async (fsDir: string): Promise<boolean> => {
  return await Deno.permissions.query(
    { name: "write", path: fsDir } as const,
  ).then((status) => status.state === "granted");
};

export const isFileSystemAvailable =
  FILE_SYSTEM_CACHE_DIRECTORY !== undefined &&
  await hasWritePerm(FILE_SYSTEM_CACHE_DIRECTORY);
