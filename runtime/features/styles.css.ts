import { join } from "../../compat/std-path.ts";
import { env, fs, cwd } from "../../compat/mod.ts";

const TAILWIND_FILE = "tailwind.css";

const STATIC_ROOT = env.get("STATIC_ROOT") || join(cwd(), "static");

const TO: string = join(STATIC_ROOT, TAILWIND_FILE);

export const styles = (): Promise<string> =>
  fs.readTextFile(TO).catch(() =>
    `Missing TailwindCSS file in production. Make sure you are building the file on the CI`
  );
