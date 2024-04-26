export interface Options {
  id: number;
  worker: Worker;
  lastActivity: number;
  envVars: { [key: string]: string };
  cwd: string;
  memoryLimit: number;
  cpuLimit: number;
  permissions: Deno.PermissionDescriptor;
  entrypoint?: string;
}
