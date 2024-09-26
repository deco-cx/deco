import { join } from "@std/path";

const TAILWIND_FILE = "tailwind.css";

const TO: string = join(Deno.cwd(), "static", TAILWIND_FILE);

export const styles = (): Promise<string> =>
  Deno.readTextFile(TO).catch(() =>
    `Missing TailwindCSS file in production. Make sure you are building the file on the CI`
  );
