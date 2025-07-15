# Scripts - Ferramentas de Automação e CLI

O diretório `scripts/` contém scripts de automação, ferramentas CLI e
utilitários para gerenciamento de aplicações deco.

## Arquitetura

```
scripts/
├── dev.ts                  # Script de desenvolvimento
├── init.ts                 # Inicialização de projetos
├── run.ts                  # Execução de scripts
├── release.ts              # Gerenciamento de releases
├── update.ts               # Atualização de dependências
├── upgrade.ts              # Upgrade de versões
├── pkg.ts                  # Gerenciamento de pacotes
├── registry.ts             # Gerenciamento de registry
├── formatter.ts            # Formatação de código
├── codemod.ts              # Transformações de código
├── changelog.ts            # Geração de changelog
├── order_imports.ts        # Ordenação de imports
├── tailwindChecker.ts      # Verificação Tailwind
├── update.run.ts           # Execução de updates
├── utils.ts                # Utilitários dos scripts
├── deno.json              # Configuração Deno
├── LICENSE                # Licença
└── apps/                  # Scripts para aplicações
    ├── bundle.ts          # Bundling de aplicações
    ├── bundle.lib.ts      # Biblioteca de bundling
    ├── config.ts          # Configuração de apps
    ├── context.ts         # Contexto de aplicações
    ├── dev.ts             # Desenvolvimento de apps
    ├── init.ts            # Inicialização de apps
    ├── install.ts         # Instalação de apps
    ├── link.ts            # Linking de apps
    ├── uninstall.ts       # Desinstalação de apps
    ├── unlink.ts          # Unlinking de apps
    ├── watcher.ts         # File watcher
    └── templates/         # Templates de apps
        ├── app.loaders.bin.ts.ts
        ├── app.mod.ts.ts
        ├── deco.ts.ts
        └── deno.json.ts
```

## Funcionalidades Principais

### Init Script (`init.ts`)

```typescript
export const init = async (name: string, template: string = "site") => {
  const configs = {
    site: {
      git: "https://github.com/deco-sites/storefront/archive/main.zip",
      release:
        "https://github.com/deco-sites/storefront/raw/main/.decofile.json",
      appName: "storefront",
    },
    app: {
      git: "https://github.com/deco-cx/app-template/archive/main.zip",
      release:
        "https://github.com/deco-cx/app-template/raw/main/.decofile.json",
      appName: "app-template",
    },
  };

  const config = configs[template];
  const root = await initProject(name, config);

  console.log(`✅ Project created at ${root}`);
  console.log(`🚀 Run: cd ${name} && deno task start`);
};
```

### Bundle Script (`apps/bundle.ts`)

```typescript
export const bundleApp = async (appName: string): Promise<void> => {
  const manifest = await generateManifest(appName);
  const bundleResult = await esbuild.build({
    entryPoints: [manifest.main],
    bundle: true,
    format: "esm",
    outfile: `dist/${appName}.js`,
    external: ["deno:*", "node:*"],
    plugins: [
      denoPlugin(),
      manifestPlugin(manifest),
    ],
  });

  if (bundleResult.errors.length > 0) {
    throw new Error(`Bundle failed: ${bundleResult.errors.join("\n")}`);
  }

  console.log(`✅ Bundle created: dist/${appName}.js`);
};
```

### Development Script (`dev.ts`)

```typescript
export const dev = async (options: DevOptions = {}) => {
  const {
    port = 8000,
    hostname = "localhost",
    watch = true,
    tunnel = false,
  } = options;

  // Start development server
  const server = Deno.serve({ port, hostname }, handler);

  // Setup file watching
  if (watch) {
    const watcher = Deno.watchFs(".", { recursive: true });
    for await (const event of watcher) {
      if (
        event.kind === "modify" && event.paths.some((p) => p.endsWith(".ts"))
      ) {
        console.log("🔄 Restarting...");
        await server.shutdown();
        // Restart logic here
      }
    }
  }

  // Setup tunnel if requested
  if (tunnel) {
    await setupTunnel(port);
  }

  console.log(`🚀 Server running on http://${hostname}:${port}`);
};
```

### Codemod Script (`codemod.ts`)

```typescript
export const runCodemod = async (
  pattern: string,
  transformation: string,
): Promise<void> => {
  const files = await glob(pattern);

  for (const file of files) {
    const content = await Deno.readTextFile(file);
    const transformed = await applyTransformation(content, transformation);

    if (transformed !== content) {
      await Deno.writeTextFile(file, transformed);
      console.log(`✅ Transformed: ${file}`);
    }
  }
};

const applyTransformation = async (
  content: string,
  transformation: string,
): Promise<string> => {
  // Common transformations
  const transformations = {
    "update-imports": updateImports,
    "upgrade-deps": upgradeDeps,
    "format-code": formatCode,
    "fix-types": fixTypes,
  };

  const transform = transformations[transformation];
  if (!transform) {
    throw new Error(`Unknown transformation: ${transformation}`);
  }

  return transform(content);
};
```

### App Management (`apps/`)

#### Install App (`apps/install.ts`)

```typescript
export const installApp = async (appName: string, version?: string) => {
  const registry = await getRegistry();
  const appInfo = registry.apps[appName];

  if (!appInfo) {
    throw new Error(`App not found: ${appName}`);
  }

  const targetVersion = version || appInfo.latest;
  const downloadUrl = `${appInfo.repository}/archive/v${targetVersion}.zip`;

  // Download and extract
  const appDir = `apps/${appName}`;
  await downloadAndExtract(downloadUrl, appDir);

  // Update manifest
  await updateManifest(appName, targetVersion);

  console.log(`✅ Installed ${appName}@${targetVersion}`);
};
```

#### Link App (`apps/link.ts`)

```typescript
export const linkApp = async (appPath: string, linkName?: string) => {
  const resolvedPath = path.resolve(appPath);
  const name = linkName || path.basename(resolvedPath);

  // Create symlink
  const linkPath = `apps/${name}`;
  await Deno.symlink(resolvedPath, linkPath);

  // Update import map
  await updateImportMap(name, linkPath);

  console.log(`✅ Linked ${name} -> ${resolvedPath}`);
};
```

### Release Management (`release.ts`)

```typescript
export const createRelease = async (version: string, notes?: string) => {
  // Validate version
  if (!semver.valid(version)) {
    throw new Error(`Invalid version: ${version}`);
  }

  // Update version in files
  await updateVersionInFiles(version);

  // Generate changelog
  const changelog = await generateChangelog(version, notes);

  // Create git tag
  await execCommand(["git", "tag", version]);

  // Push to remote
  await execCommand(["git", "push", "origin", version]);

  console.log(`✅ Release ${version} created`);
  console.log(`📋 Changelog:\n${changelog}`);
};

const updateVersionInFiles = async (version: string) => {
  const files = ["deno.json", "package.json", "mod.ts"];

  for (const file of files) {
    if (await exists(file)) {
      const content = await Deno.readTextFile(file);
      const updated = content.replace(
        /"version":\s*"[^"]*"/,
        `"version": "${version}"`,
      );
      await Deno.writeTextFile(file, updated);
    }
  }
};
```

### Update Script (`update.ts`)

```typescript
export const update = async (options: UpdateOptions = {}) => {
  const {
    check = false,
    force = false,
    package: packageName,
  } = options;

  if (check) {
    return await checkUpdates();
  }

  if (packageName) {
    return await updatePackage(packageName, force);
  }

  return await updateAll(force);
};

const checkUpdates = async () => {
  const denoJson = await readDenoJson();
  const updates = [];

  for (const [pkg, version] of Object.entries(denoJson.imports || {})) {
    const latest = await getLatestVersion(pkg);
    if (latest && semver.gt(latest, version)) {
      updates.push({ pkg, current: version, latest });
    }
  }

  if (updates.length === 0) {
    console.log("✅ All packages up to date");
  } else {
    console.log("📦 Available updates:");
    updates.forEach(({ pkg, current, latest }) => {
      console.log(`  ${pkg}: ${current} -> ${latest}`);
    });
  }

  return updates;
};
```

### Formatter (`formatter.ts`)

```typescript
export const format = async (pattern: string = "**/*.{ts,tsx,js,jsx}") => {
  const files = await glob(pattern);

  for (const file of files) {
    const content = await Deno.readTextFile(file);
    const formatted = await formatCode(content, file);

    if (formatted !== content) {
      await Deno.writeTextFile(file, formatted);
      console.log(`✅ Formatted: ${file}`);
    }
  }
};

const formatCode = async (
  content: string,
  filename: string,
): Promise<string> => {
  // Use Deno fmt for TypeScript files
  if (filename.endsWith(".ts") || filename.endsWith(".tsx")) {
    const process = new Deno.Command("deno", {
      args: ["fmt", "--stdin"],
      stdin: "piped",
      stdout: "piped",
    });

    const proc = process.spawn();
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(content));
    await writer.close();

    const result = await proc.output();
    return new TextDecoder().decode(result.stdout);
  }

  return content;
};
```

## Exemplo de Uso

```bash
# Inicializar projeto
deno run -A scripts/init.ts my-site

# Desenvolvimento
deno run -A scripts/dev.ts --port 3000 --tunnel

# Instalar app
deno run -A scripts/apps/install.ts commerce

# Criar release
deno run -A scripts/release.ts 1.0.0 "Initial release"

# Atualizar dependências
deno run -A scripts/update.ts --check

# Executar codemod
deno run -A scripts/codemod.ts "**/*.ts" update-imports
```

O diretório scripts fornece uma suíte completa de ferramentas para
desenvolvimento, deploy e manutenção de aplicações deco.
