import { join } from "https://deno.land/std@0.190.0/path/mod.ts";
import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@0.8.2/registry.ts";
import { InitContext } from './context.ts';

export type TemplateGenerator = (ctx: InitContext) => Promise<string> | string;

type TemplateRef = string | { [key: string]: TemplateRef | Templates };
type Templates = TemplateRef[];

const isTemplateName = (ref: TemplateRef): ref is string => {
  return typeof ref === "string";
};

const createFromTemplates = async (
  templates: Templates,
  dir: string,
  ctx: InitContext,
  refPrefix = "",
) => {
  await Promise.all(templates.map(createFromTemplate(ctx, dir, refPrefix)));
};
const createFromTemplate =
  (ctx: InitContext, dir: string, refPrefix: string) =>
    async (ref: TemplateRef) => {
      if (isTemplateName(ref)) {
        const func: { default: TemplateGenerator } = await import(
          `./templates/${refPrefix}${ref}.ts`
        );
        const str = await func.default(ctx);
        const fileDir = join(dir, ref);
        await Deno.writeTextFile(fileDir, str);
        return;
      }
      const subTemplates: Promise<void>[] = [];
      for (const key of Object.keys(ref)) {
        subTemplates.push((async () => {
          const subDir = join(dir, key);
          const newPrefix = `${refPrefix}${key}.`;
          await Deno.mkdir(subDir);
          const subTemplateCreate = createFromTemplate(
            ctx,
            subDir,
            newPrefix,
          );
          const subTemplates = ref[key];
          await (Array.isArray(subTemplates)
            ? createFromTemplates(
              subTemplates,
              subDir,
              ctx,
              newPrefix,
            )
            : subTemplateCreate(subTemplates));
        })());
      }
      await Promise.all(subTemplates);
    };

const templates: Templates = [
  "import_map.json",
  "deno.json",
  "deco.ts",
  "deps.ts",
  {
    app: ["mod.ts", { loaders: ["bin.ts"] }],
  },
];

const init = async () => {
  const latestVersionPromise = lookup(
    "https://denopkg.com/deco-cx/deco@main/",
    REGISTRIES,
  )
    ?.all().then((all) => all[0]);
  const name = prompt("What's the app name?:");
  if (!name) {
    console.error("app name is required");
    return;
  }
  const appFolder = join(Deno.cwd(), name);
  await Deno.mkdir(appFolder, { recursive: true });

  const initContext = {
    appName: name,
    decoVersion: (await latestVersionPromise) ?? "main",
  };
  await createFromTemplates(templates, appFolder, initContext);
};

if (import.meta.main) {
  await init();
}