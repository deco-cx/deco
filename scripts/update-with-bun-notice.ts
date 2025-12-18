#!/usr/bin/env -S deno run -A
/**
 * Deco Update Script with Bun Support Notice
 * 
 * This script wraps the standard deco update and shows a notice about
 * Bun runtime support.
 * 
 * Usage: deno run -Ar https://deno.land/x/deco/scripts/update-with-bun-notice.ts
 */

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function showBunBanner() {
  console.log(`
${colors.cyan}┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ${colors.magenta}${colors.bold}🐰 NEW: Bun Runtime Support Available!${colors.reset}${colors.cyan}                         │
│                                                                  │
│  Run your Deco store on Bun for:                                 │
│    ${colors.green}•${colors.cyan} 4x faster hot reload                                        │
│    ${colors.green}•${colors.cyan} 3x lower memory usage                                       │
│    ${colors.green}•${colors.cyan} Better Node.js ecosystem compatibility                      │
│                                                                  │
│  ${colors.yellow}To migrate, run:${colors.reset}${colors.cyan}                                                 │
│    ${colors.bold}deno task migrate:bun${colors.reset}${colors.cyan}                                          │
│                                                                  │
│  ${colors.dim}Learn more: https://deco.cx/docs/bun${colors.reset}${colors.cyan}                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘${colors.reset}
`);
}

async function main() {
  // Run the standard update first
  console.log(`${colors.blue}Updating Deco dependencies...${colors.reset}\n`);
  
  const process = new Deno.Command("deno", {
    args: ["run", "-Ar", "https://deco.cx/update"],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  
  const { code } = await process.output();
  
  if (code === 0) {
    // Show the Bun banner after successful update
    console.log();
    showBunBanner();
    
    // Check if migrate:bun task exists
    try {
      const denoJson = JSON.parse(await Deno.readTextFile("deno.json"));
      if (!denoJson.tasks?.["migrate:bun"]) {
        console.log(`${colors.yellow}Tip:${colors.reset} Add the migrate task to your deno.json:\n`);
        console.log(`  "tasks": {`);
        console.log(`    ...`);
        console.log(`    ${colors.green}"migrate:bun": "deno run -A jsr:@deco/deco/scripts/migrate-to-bun"${colors.reset}`);
        console.log(`  }\n`);
      }
    } catch {
      // Ignore if we can't read deno.json
    }
  }
  
  Deno.exit(code);
}

if (import.meta.main) {
  main();
}

