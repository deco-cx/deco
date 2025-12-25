# Blocks.ts

## Config, Content & Data for TypeScript Apps

**One place to see, edit, and deploy everything your app configures and fetches.**

```bash
npm install blocks.ts
```

---

## What is Blocks.ts?

Blocks.ts transforms any TypeScript codebase into a **configurable, versioned, editable interface** for non-technical users—without changing how you write code.

It gives you:

- **Content Management** — Edit UI content, copy, images
- **Configuration Management** — Feature flags, settings, secrets
- **Data Layer Visibility** — See every loader, every API call, every async operation
- **Git-Native Versioning** — Every edit is a JSON change, triggering HMR
- **Stateless Preview** — Edit and preview without running code locally
- **Production Hot-Push** — Update configs in running Kubernetes pods instantly

All from TypeScript types. No separate config files. No external services.

---

## The Vision

### Before Blocks.ts

Your TypeScript app has:
- Hardcoded content in components
- Scattered config files (`.env`, `config.json`, feature flags)
- Loaders/API calls hidden in the codebase
- Secrets in environment variables nobody can audit
- Deploys required for every content change

### After Blocks.ts

```
/_admin
├── Pages
│   ├── Homepage
│   │   ├── Hero (content)
│   │   ├── Features (content)
│   │   └── Loaders
│   │       ├── getProducts() → Shopify API
│   │       └── getReviews() → Trustpilot API
│   └── Product Page
│       ├── ProductInfo (content)
│       └── Loaders
│           ├── getProduct(slug) → Shopify API
│           ├── getRecommendations() → Algolia
│           └── getInventory() → Warehouse API
├── Config
│   ├── Feature Flags
│   ├── API Endpoints
│   └── App Settings
├── Secrets
│   ├── SHOPIFY_API_KEY ••••••
│   ├── STRIPE_SECRET ••••••
│   └── DATABASE_URL ••••••
└── History
    └── All changes, all time, git-native
```

**Every loader. Every config. Every piece of content. One place.**

---

## Core Capabilities

### 1. Content Management

Edit any content that comes from your TypeScript types:

```typescript
interface HeroProps {
  title: string;
  /** @format rich-text */
  description: string;
  /** @format image-uri */
  backgroundImage: string;
}
```

→ Automatically generates a beautiful editor UI

→ Saves to `blocks/pages/homepage/hero.json`

→ Your component reads it with `useBlock()`

### 2. Configuration Management

Same pattern for app config:

```typescript
interface FeatureFlags {
  enableDarkMode: boolean;
  enableNewCheckout: boolean;
  maxCartItems: number;
  /** @format secret */
  analyticsKey: string;
}
```

→ Editor UI with toggles, numbers, secret fields

→ Saves to `blocks/config/features.json`

→ App reads with `useConfig()`

### 3. Secrets & Token Management

Secure handling of sensitive values:

```typescript
interface Secrets {
  /** @format secret */
  STRIPE_SECRET_KEY: string;
  /** @format secret */
  DATABASE_URL: string;
  /** @format secret */
  API_KEY: string;
}
```

- Encrypted at rest
- Never logged or exposed
- Audit trail of access
- Environment-aware (dev/staging/prod)
- Rotation reminders

### 4. Loader & Data Layer Visibility

**See every API call your app makes:**

Blocks.ts analyzes your codebase and finds:
- Every `loader` function
- Every `fetch()` call
- Every async data dependency
- What each page/route depends on

```
/_admin/data
├── App-wide Loaders
│   ├── getSession() → Auth API (every page)
│   └── getCart() → Commerce API (every page)
├── /homepage
│   ├── getProducts() → Shopify (async)
│   ├── getReviews() → Trustpilot (async)
│   └── getBanner() → blocks/homepage/banner.json (sync)
├── /product/[slug]
│   ├── getProduct(slug) → Shopify (async)
│   ├── getRecommendations() → Algolia (async)
│   └── getProductContent() → blocks/product/content.json (sync)
└── /checkout
    ├── getCart() → Commerce API (async)
    ├── getShippingRates() → Shipping API (async)
    └── getPaymentMethods() → Stripe (async)
```

**For each loader, you can:**
- See the TypeScript signature
- View sample responses
- Monitor performance (avg latency, error rate)
- Configure caching behavior
- Set up fallbacks

### 5. Git-Native Versioning

Every change in the UI = a JSON file change = HMR trigger

```
blocks/
├── pages/
│   └── homepage/
│       ├── hero.json      # Content
│       └── features.json  # Content
├── config/
│   ├── features.json      # Feature flags
│   └── settings.json      # App settings
└── secrets/
    └── .encrypted.json    # Encrypted secrets
```

**Change history is just `git log`:**
```bash
$ git log --oneline blocks/
a1b2c3d Update homepage hero title
d4e5f6g Enable dark mode feature flag
g7h8i9j Update Stripe API key
```

- Every change attributed to a user
- Easy rollback with `git revert`
- Branch-based workflows (staging, preview, production)
- PR reviews for content changes

### 6. Stateless Preview Mode

**Edit and preview without running code locally.**

For staging/preview environments:

1. Your app runs in a stateless container
2. Editor UI runs separately (or at `/_admin`)
3. Content changes are injected via API
4. Preview iframe shows the result
5. No local dev environment needed

```
┌─────────────────────────────────────────────────────────┐
│  Blocks.ts Editor (runs anywhere)                        │
│  ┌─────────────────────┬───────────────────────────────┐ │
│  │ Edit Hero           │  Preview (your app)           │ │
│  │ ─────────────       │  ┌─────────────────────────┐  │ │
│  │ Title: [Welcome]    │  │                         │  │ │
│  │ Subtitle: [...]     │  │  Welcome to Our Site    │  │ │
│  │ Image: [🖼️ hero.jpg] │  │  ─────────────────────  │  │ │
│  │                     │  │  Your subtitle here...  │  │ │
│  │ [Save] [Publish]    │  │                         │  │ │
│  └─────────────────────┴───────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼ Injects blocks via API
                    ┌─────────────────────┐
                    │  Your App (stateless)│
                    │  Deployed on Vercel/ │
                    │  Cloudflare/K8s      │
                    └─────────────────────┘
```

**Benefits:**
- Content editors don't need local setup
- Preview works on any device
- Branch previews with different content
- No code required to edit content

### 7. Kubernetes Hot-Push (Advanced)

**Update configs in production without redeploying.**

For commits that only change `blocks/`:

```yaml
# blocks-operator.yaml
apiVersion: blocks.ts/v1
kind: BlocksSync
metadata:
  name: my-app-blocks
spec:
  repository: github.com/myorg/myapp
  branch: main
  path: blocks/
  target:
    deployment: my-app
    namespace: production
  strategy:
    type: HotPush
    # Pods receive new config via sidecar
    # No restart, no downtime
```

**How it works:**

1. Commit changes to `blocks/` folder
2. Blocks.ts operator detects the change
3. Operator pushes new config to running pods
4. Pods hot-reload the config (no restart)
5. Caches stay warm, connections stay alive
6. **Seconds to production, not minutes**

**Use cases:**
- Emergency content fixes
- Feature flag toggles
- A/B test configuration
- API endpoint updates
- Secret rotation

---

## The User Journey

### Developer Setup (5 minutes)

```bash
# Install
npm install blocks.ts

# Initialize
npx blocks init

# This creates:
# - blocks/           (content storage)
# - blocks.config.ts  (configuration)
# - BLOCKS_AGENT.md   (AI agent instructions)
```

### Register Pages & Components

```typescript
// blocks.config.ts
import { defineBlocks } from "blocks.ts";

export default defineBlocks({
  // Where to find components
  components: "./components/**/*.tsx",
  
  // Pages and their editable regions
  pages: {
    "/": {
      name: "Homepage",
      components: {
        hero: "Hero",
        features: "Features",
        cta: "CTA",
      },
    },
    "/product/[slug]": {
      name: "Product Page",
      dynamic: true,
      components: {
        info: "ProductInfo",
        reviews: "ReviewSection",
      },
    },
  },
  
  // App-wide configuration
  config: {
    features: "FeatureFlags",
    settings: "AppSettings",
    theme: "ThemeConfig",
  },
  
  // Secret management
  secrets: {
    enabled: true,
    encryption: "aes-256-gcm",
  },
  
  // Loader analysis
  loaders: {
    enabled: true,
    patterns: ["**/loaders/**/*.ts", "**/api/**/*.ts"],
  },
});
```

### Add the Admin Route

```typescript
// Next.js: app/_admin/[[...path]]/page.tsx
export { AdminPage as default } from "blocks.ts/admin";

// With authentication:
import { AdminPage } from "blocks.ts/admin";
import { auth } from "@/lib/auth";

export default async function Admin() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return redirect("/login");
  }
  return <AdminPage />;
}
```

### Consume Blocks in Your App

```typescript
// Content
import { useBlock } from "blocks.ts";

function Hero() {
  const hero = useBlock<HeroProps>("pages/homepage/hero");
  return <HeroComponent {...hero} />;
}

// Config
import { useConfig } from "blocks.ts";

function App() {
  const features = useConfig<FeatureFlags>("features");
  return features.enableDarkMode ? <DarkTheme /> : <LightTheme />;
}

// Secrets (server-side only)
import { getSecret } from "blocks.ts/server";

async function callStripe() {
  const key = await getSecret("STRIPE_SECRET_KEY");
  // Use the key...
}
```

---

## Admin UI

### Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Blocks.ts                                        [Deploy ▼] 👤 │
├─────────────────┬───────────────────────────────────────────────┤
│                 │                                               │
│  📄 Pages       │  Dashboard                                    │
│  ⚙️ Config      │  ─────────────────────────────────────────    │
│  🔑 Secrets     │                                               │
│  📡 Loaders     │  Recent Changes                               │
│  📜 History     │  ┌─────────────────────────────────────────┐  │
│                 │  │ 🟢 Homepage hero updated      2 min ago │  │
│  ─────────────  │  │ 🟢 Dark mode enabled          1 hour ago│  │
│                 │  │ 🟡 API key rotated            yesterday │  │
│  Environments   │  └─────────────────────────────────────────┘  │
│  • Production   │                                               │
│  • Staging      │  Loader Health                                │
│  • Preview      │  ┌─────────────────────────────────────────┐  │
│                 │  │ getProducts()    ✅ 45ms avg            │  │
│                 │  │ getReviews()     ✅ 120ms avg           │  │
│                 │  │ getInventory()   ⚠️ 850ms avg (slow)    │  │
│                 │  └─────────────────────────────────────────┘  │
└─────────────────┴───────────────────────────────────────────────┘
```

### Pages View

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Dashboard                                     Homepage        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Components                              Loaders                │
│  ┌──────────────────────────────┐       ┌────────────────────┐  │
│  │ 🎯 Hero          [Edit]      │       │ getProducts()      │  │
│  │ 📦 Features      [Edit]      │       │ └─ Shopify API     │  │
│  │ 🔘 CTA           [Edit]      │       │ └─ 45ms avg        │  │
│  └──────────────────────────────┘       │                    │  │
│                                         │ getReviews()       │  │
│  Content Blocks: 3                      │ └─ Trustpilot      │  │
│  Last updated: 2 hours ago              │ └─ 120ms avg       │  │
│  By: john@company.com                   └────────────────────┘  │
│                                                                 │
│  [Preview Page] [View History] [Compare Environments]           │
└─────────────────────────────────────────────────────────────────┘
```

### Loaders View

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Dashboard                                     Loaders         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  All Loaders (12)                    Filter: [All Pages ▼]     │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ getProducts()                                           │   │
│  │ ─────────────                                           │   │
│  │ Source: ./loaders/shopify/getProducts.ts                │   │
│  │ API: https://api.shopify.com/graphql                    │   │
│  │ Used by: Homepage, Category Page, Search Results        │   │
│  │                                                         │   │
│  │ Performance (24h)                                       │   │
│  │ ████████████████████░░░░ 45ms avg | 12ms p50 | 180ms p99│   │
│  │                                                         │   │
│  │ [View Schema] [Sample Response] [Configure Caching]     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ getCart()                                               │   │
│  │ ─────────────                                           │   │
│  │ Source: ./loaders/commerce/getCart.ts                   │   │
│  │ API: https://api.commerce.com/cart                      │   │
│  │ Used by: All pages (global)                             │   │
│  │ [View Schema] [Sample Response] [Configure Caching]     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Secrets View

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Dashboard                                     Secrets         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Environment: [Production ▼]                                    │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ STRIPE_SECRET_KEY                                        │  │
│  │ Value: sk_live_••••••••••••••••••••••••                  │  │
│  │ Last rotated: 30 days ago ⚠️ Consider rotating           │  │
│  │ Used by: checkout, webhooks                              │  │
│  │ [Reveal] [Rotate] [View Access Log]                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ DATABASE_URL                                             │  │
│  │ Value: postgres://••••••••••••••••••••••••               │  │
│  │ Last rotated: 90 days ago                                │  │
│  │ Used by: all server functions                            │  │
│  │ [Reveal] [Rotate] [View Access Log]                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [+ Add Secret] [Import from .env] [Export (encrypted)]        │
└─────────────────────────────────────────────────────────────────┘
```

### History View

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Dashboard                                     History         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filter: [All ▼] [All Users ▼] [Last 7 days ▼]                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Today                                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🟢 10:45 AM  john@company.com                            │  │
│  │    Updated: pages/homepage/hero.json                     │  │
│  │    Changed: title, subtitle                              │  │
│  │    [View Diff] [Revert] [Compare with Production]        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ 🟢 09:30 AM  sarah@company.com                           │  │
│  │    Updated: config/features.json                         │  │
│  │    Changed: enableDarkMode (false → true)                │  │
│  │    [View Diff] [Revert] [Compare with Production]        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Yesterday                                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🟡 4:15 PM   admin@company.com                           │  │
│  │    Rotated: secrets/STRIPE_SECRET_KEY                    │  │
│  │    [View Access Log]                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Storage Format

### Directory Structure

```
blocks/
├── pages/
│   ├── homepage/
│   │   ├── hero.json
│   │   ├── features.json
│   │   └── cta.json
│   ├── about/
│   │   ├── team.json
│   │   └── story.json
│   └── product/
│       └── [slug]/
│           ├── info.json
│           └── reviews.json
├── config/
│   ├── features.json
│   ├── settings.json
│   └── theme.json
├── secrets/
│   └── .encrypted.json
└── .blocksrc
    ├── schemas/        # Cached JSON schemas
    ├── loaders.json    # Loader registry
    └── manifest.json   # Block manifest
```

### Block File Format

```json
// blocks/pages/homepage/hero.json
{
  "$schema": "https://blocks.ts/schemas/block.json",
  "__type": "HeroProps",
  "__component": "./components/Hero.tsx",
  "__meta": {
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-16T14:22:00Z",
    "createdBy": "john@company.com",
    "version": 3
  },
  
  "title": "Welcome to Our Site",
  "description": "Build amazing things with our platform",
  "backgroundImage": "/images/hero.jpg",
  "cta": {
    "text": "Get Started",
    "href": "/signup"
  }
}
```

### Secrets Format (Encrypted)

```json
// blocks/secrets/.encrypted.json
{
  "$schema": "https://blocks.ts/schemas/secrets.json",
  "__encryption": {
    "algorithm": "aes-256-gcm",
    "keyId": "key-2024-01"
  },
  
  "STRIPE_SECRET_KEY": {
    "value": "encrypted:base64...",
    "rotatedAt": "2024-01-01T00:00:00Z",
    "usedBy": ["checkout", "webhooks"]
  },
  "DATABASE_URL": {
    "value": "encrypted:base64...",
    "rotatedAt": "2023-10-15T00:00:00Z",
    "usedBy": ["*"]
  }
}
```

---

## API Reference

### Content & Config

```typescript
// React hooks
import { useBlock, useConfig } from "blocks.ts";

// Server-side
import { getBlock, getConfig, getSecret } from "blocks.ts/server";

// Programmatic access
import { blocks } from "blocks.ts";

// List all blocks
const allBlocks = await blocks.list();
const pageBlocks = await blocks.list("pages/homepage/*");

// Get a block
const hero = await blocks.get<HeroProps>("pages/homepage/hero");

// Update a block
await blocks.set("pages/homepage/hero", { title: "New Title" });

// Watch for changes
blocks.watch("pages/*", (block) => {
  console.log("Block updated:", block.path);
});
```

### Loaders

```typescript
import { loaders } from "blocks.ts";

// List all loaders
const allLoaders = await loaders.list();

// Get loader info
const loader = await loaders.get("getProducts");
console.log(loader.usedBy);      // ["Homepage", "Category"]
console.log(loader.avgLatency);  // 45
console.log(loader.schema);      // JSON Schema of return type

// Get loaders for a page
const pageLoaders = await loaders.forPage("/");
```

### Secrets

```typescript
import { secrets } from "blocks.ts/server";

// Get a secret (decrypted)
const stripeKey = await secrets.get("STRIPE_SECRET_KEY");

// Set a secret
await secrets.set("NEW_SECRET", "value");

// Rotate a secret
await secrets.rotate("STRIPE_SECRET_KEY", "new_value");

// List secrets (metadata only)
const allSecrets = await secrets.list();
// Returns: [{ name, rotatedAt, usedBy }, ...]
```

---

## Deployment Modes

### 1. Standard Mode (Git-based)

Default mode. Changes commit to git, deploy triggers.

```
Editor → Save → Git commit → CI/CD → Deploy → Live
```

### 2. Stateless Preview Mode

For staging/preview without local dev:

```typescript
// blocks.config.ts
export default defineBlocks({
  preview: {
    mode: "stateless",
    apiUrl: "https://preview.yourapp.com/api/blocks",
  },
});
```

The preview app exposes an API that accepts block overrides:

```typescript
// Your app's preview API route
import { withBlocksPreview } from "blocks.ts/preview";

export const POST = withBlocksPreview(async (req, blocks) => {
  // blocks contains the preview overrides
  // Render your page with these blocks
  return renderPage(blocks);
});
```

### 3. Hot-Push Mode (Kubernetes)

For instant production updates:

```yaml
# Install the operator
helm install blocks-operator blocks.ts/operator

# Configure sync
apiVersion: blocks.ts/v1
kind: BlocksSync
metadata:
  name: my-app
spec:
  source:
    type: git
    repository: github.com/org/app
    branch: main
    path: blocks/
  target:
    deployment: my-app
    namespace: production
  sync:
    interval: 10s
    hotPush: true  # Push to pods without restart
```

**How hot-push works:**

1. Blocks.ts sidecar runs in each pod
2. Operator detects changes in `blocks/` folder
3. Operator pushes new blocks to sidecars
4. Sidecars update in-memory block cache
5. Next request uses new blocks
6. **Zero downtime, zero cold start**

---

## Agent Instructions (BLOCKS_AGENT.md)

Auto-generated file for AI coding assistants:

```markdown
# Blocks.ts Agent Instructions

This codebase uses Blocks.ts for configuration and content management.

## Quick Reference

- **Storage**: `blocks/` folder (JSON files)
- **Config**: `blocks.config.ts`
- **Admin UI**: `/_admin` route
- **API**: `useBlock()`, `useConfig()`, `getBlock()`, `getSecret()`

## Architecture

```
blocks/
├── pages/      # Content per page
├── config/     # App configuration
├── secrets/    # Encrypted secrets
└── .blocksrc/  # Internal (schemas, manifest)
```

## Making Content Editable

1. Component exports its Props type
2. Register page in `blocks.config.ts`
3. Use `useBlock()` or `getBlock()` to read content
4. Create initial JSON in `blocks/pages/{page}/{component}.json`

## Type-to-Widget Mapping

| TypeScript | Widget |
|------------|--------|
| `string` | Text input |
| `string` + `@format rich-text` | Rich text editor |
| `string` + `@format image-uri` | Image picker |
| `string` + `@format secret` | Password field |
| `number` | Number input |
| `boolean` | Toggle switch |
| `"a" \| "b" \| "c"` | Select dropdown |
| `SomeType[]` | Repeatable list |
| Nested objects | Collapsible fieldset |

## Common Tasks

### Add a new editable page
1. Add to `blocks.config.ts`:
   ```typescript
   pages: {
     "/new-page": {
       components: ["Hero", "Content"]
     }
   }
   ```
2. Use `useBlock()` in the page component
3. Create JSON files in `blocks/pages/new-page/`

### Add a new config section
1. Create the TypeScript interface
2. Add to `blocks.config.ts`:
   ```typescript
   config: {
     myConfig: "MyConfigType"
   }
   ```
3. Use `useConfig()` to read it
4. Create `blocks/config/myConfig.json`

### Add a secret
1. Use `getSecret("SECRET_NAME")` in server code
2. Add via UI at `/_admin/secrets`
3. Or run `npx blocks secret set SECRET_NAME value`
```

---

## Comparison

| Feature | Blocks.ts | Payload CMS | Contentful | Sanity |
|---------|-----------|-------------|------------|--------|
| Schema source | TypeScript types | Config file | UI | GROQ |
| Storage | Local files / Git | Database | Cloud | Cloud |
| Loaders/Data | ✅ Full visibility | ❌ | ❌ | ❌ |
| Secrets | ✅ Built-in | ❌ | ❌ | ❌ |
| Hot-push K8s | ✅ Operator | ❌ | ❌ | ❌ |
| Stateless preview | ✅ | ❌ | ✅ | ✅ |
| Self-hosted | ✅ | ✅ | ❌ | Limited |
| Vendor lock-in | None | None | Yes | Yes |
| Setup time | 5 min | 1 hour | 1 day | 1 day |

---

## Roadmap

### v0.1 - Foundation (Q1 2025)

- [ ] `npx blocks init` - Project setup
- [ ] Schema generation from TypeScript
- [ ] Basic admin UI at `/_admin`
- [ ] `blocks/` folder storage
- [ ] `useBlock()` / `getBlock()` API
- [ ] Hot reload on save
- [ ] `BLOCKS_AGENT.md` generation

### v0.2 - Config & Loaders (Q2 2025)

- [ ] Configuration management (`useConfig`)
- [ ] Loader analysis and registry
- [ ] Per-page loader visibility
- [ ] Basic secrets support
- [ ] Git history integration

### v0.3 - Preview & Secrets (Q3 2025)

- [ ] Stateless preview mode
- [ ] Full secrets management
- [ ] Secret encryption & rotation
- [ ] Multi-environment support
- [ ] Branch previews

### v1.0 - Production Ready (Q4 2025)

- [ ] Kubernetes operator
- [ ] Hot-push deployment
- [ ] Performance monitoring
- [ ] Audit logging
- [ ] RBAC / permissions
- [ ] Documentation site
- [ ] Framework examples

### v1.1+ - Advanced Features (2026)

- [ ] A/B testing integration
- [ ] Analytics dashboard
- [ ] Workflow approvals
- [ ] Multi-tenant support
- [ ] Plugin system
- [ ] VS Code extension

---

## Philosophy

### Why Blocks.ts?

1. **Types are the source of truth** — No schema duplication
2. **Git is the database** — Version control for content
3. **Local-first** — Works offline, no external dependencies
4. **Progressive disclosure** — Simple by default, powerful when needed
5. **Framework-agnostic** — Works with any TypeScript app
6. **Open source** — No vendor lock-in, forever

### Who is this for?

- **Developers** who want to make their apps configurable without building admin panels
- **Content editors** who want to update content without asking developers
- **DevOps teams** who want instant config updates without redeployments
- **Startups** who want a simple CMS that grows with them
- **Enterprises** who need audit trails, secrets management, and security

---

## Getting Started

```bash
# Install
npm install blocks.ts

# Initialize
npx blocks init

# Start your app
npm run dev

# Open admin
open http://localhost:3000/_admin
```

That's it. Your TypeScript types are now editable.

---

## License

MIT — Open source, forever free.

Built with ❤️ by the team behind deco.cx
