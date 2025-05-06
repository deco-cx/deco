import { join } from "@std/path";

const TAILWIND_FILE = "tailwind.css";

const STATIC_ROOT = Deno.env.get("STATIC_ROOT") || join(Deno.cwd(), "static");

const TO: string = join(STATIC_ROOT, TAILWIND_FILE);

export const styles = (): Promise<string> =>
  Deno.readTextFile(TO).catch(() =>
    `Missing TailwindCSS file in production. Make sure you are building the file on the CI`
  );
