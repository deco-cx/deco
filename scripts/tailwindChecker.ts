import { walk } from "@std/fs/walk";
import * as colors from "@std/fmt/colors";

const folderPaths = "./*";
const tailwindCssUrl =
  "https://cdn.jsdelivr.net/npm/tailwindcss@2.2.15/dist/tailwind.min.css";

function isDynamicClass(cls: string): boolean {
  const bracketValueRegex = /\[\d+(px|em|rem|%|vh|vw|vmin|vmax|ch|ex)\]/;
  return bracketValueRegex.test(cls);
}

async function getAllClassesInCss(url: string): Promise<string[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
      );
    }
    const cssText = await response.text();
    const regexPattern = /\.([a-zA-Z0-9_\-\\]+)/g;
    const matches = cssText.match(regexPattern);

    return matches ? matches.map((cls) => cls.replace(".", "")) : [];
  } catch (error) {
    console.error(`Error fetching or processing CSS file: ${error}`);
    return [];
  }
}

async function getAllClassesInCode(
  folderPaths: string,
  cssClasses: string[],
): Promise<{ file: string; class: string }[]> {
  const allClasses: { file: string; class: string }[] = [];

  for (const folderPath of folderPaths) {
    try {
      for await (const entry of walk(folderPath)) {
        if (entry.isFile && entry.path.endsWith(".tsx")) {
          const ignorePaths = ["node_modules", ".gitignore"];
          if (
            ignorePaths.some((ignorePath) => entry.path.includes(ignorePath))
          ) {
            continue;
          }

          try {
            const data = await Deno.readTextFile(entry.path);
            const lines = data.split("\n");
            const classes = data.match(/class\s*=\s*["'`]([^"'`]+)["'`]/g);

            if (classes) {
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const classList = line.match(/class\s*=\s*["'`]([^"'`]+)["'`]/);
                if (classList && classList[1]) {
                  const individualClasses = classList[1].split(" ");
                  individualClasses.forEach((cls) => {
                    const cleanCls = cls.replace(/\\/g, "");
                    if (
                      !cssClasses.includes(cleanCls) &&
                      isDynamicClass(cleanCls)
                    ) {
                      allClasses.push({
                        file: `${entry.path}:${i + 1}`,
                        class: cleanCls,
                      });
                    }
                  });
                }
              }
            }
          } catch (err) {
            console.error(`Error processing file ${entry.path}: ${err}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        continue;
      }
    }
  }

  return allClasses;
}

// Reuse TextEncoder instance to avoid repeated instantiation
const textEncoder = new TextEncoder();

function showLoadingAnimation() {
  const loadingAnimation = ["|", "/", "-", "\\"];
  let index = 0;

  const interval = setInterval(() => {
    Deno.stdout.write(
      textEncoder.encode(`\rDynamic Classes: ${loadingAnimation[index]}`),
    );
    index = (index + 1) % loadingAnimation.length;
  }, 100);

  return interval;
}

async function compareClasses() {
  const interval = showLoadingAnimation();

  try {
    const cssClasses = await getAllClassesInCss(tailwindCssUrl);
    const projectClasses = await getAllClassesInCode(folderPaths, cssClasses);

    clearInterval(interval);

    if (cssClasses.length > 0 && projectClasses.length > 0) {
      const differentClasses = projectClasses.filter((entry) =>
        !cssClasses.includes(entry.class)
      );

      if (differentClasses.length > 0) {
        console.log("\n");
        console.log(
          colors.green(
            `✨ Hint: Click on the file paths to jump to the location of the class`,
          ),
        );
        console.table(differentClasses, ["file", "class"]);
      } else {
        console.log("All classes found in project files are also in CSS.");
      }
    } else {
      console.log("No classes found in CSS or project files.");
    }
  } catch (error) {
    console.error(`Error comparing classes: ${error}`);
  }
}

if (import.meta.main) {
  await compareClasses();
}
