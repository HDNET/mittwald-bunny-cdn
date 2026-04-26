import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))

// On-disk no-op stubs for browser-only resolution. Used in two places:
//
//   1. `optimizeDeps.rolldownOptions.resolve.alias` — so Vite's optimizer
//      replaces the imports inside prebundled chunks (e.g. inside
//      @tanstack/react-start) with our stubs in dev mode.
//   2. `environments.client.resolve.alias` — so the client environment's
//      source-side resolution (incl. the production client build) hits
//      the same stubs.
//
// Both scopes are CLIENT-ONLY. The SSR / Nitro / production-server build
// gets neither alias and therefore receives Node's real `node:async_hooks`
// (and the real `@mittwald/ext-bridge/node`) at runtime — without that,
// every server-function call crashes with
//   "No Start context found in AsyncLocalStorage".
//
// Earlier attempts:
//   - Top-level `resolve.alias` PLUS a Vite plugin trying to short-circuit
//     the SSR side via `options.ssr` / `applyToEnvironment` /
//     `this.environment.name` — none of those reliably override the alias
//     in the production `vite build` SSR pass. The server bundle ended
//     up containing the inline stub class anyway.
//   - The clean fix is to never let the alias reach the server scope in
//     the first place; environment-scoped aliases do exactly that.
const ASYNC_HOOKS_STUB = resolve(here, 'src/dev/async-hooks-browser-stub.js')
const EXT_BRIDGE_NODE_STUB = resolve(here, 'src/dev/ext-bridge-node-browser-stub.js')

const BROWSER_ALIASES = {
  // tanstack-start-client-core's serverFnFetcher imports node:async_hooks
  // unconditionally; on the client side we never actually execute the
  // AsyncLocalStorage path, so a no-op stub is safe.
  'node:async_hooks': ASYNC_HOOKS_STUB,
  async_hooks: ASYNC_HOOKS_STUB,
  // src/middleware/auth.ts imports @mittwald/ext-bridge/node, which is
  // server-only. tanstack-start's dev-styles plugin walks the module
  // graph in the client environment for CSS discovery and crashes on
  // the `./node` subpath because ext-bridge only exposes it under the
  // `node` condition. The stub satisfies the resolver; the real call
  // never happens because auth.ts only runs on the server at runtime.
  '@mittwald/ext-bridge/node': EXT_BRIDGE_NODE_STUB,
}

export default defineConfig({
  // Vite 8 resolves `paths` from tsconfig.json natively, so the
  // vite-tsconfig-paths plugin is no longer needed.
  resolve: {
    tsconfigPaths: true,
  },
  // Client-only aliases. The SSR / Nitro / production-server environments
  // do NOT inherit these and therefore receive the real Node modules at
  // runtime. See the BROWSER_ALIASES comment above for the full reasoning.
  environments: {
    client: {
      resolve: {
        alias: BROWSER_ALIASES,
      },
    },
  },
  optimizeDeps: {
    // @mittwald/ext-bridge/node is imported in src/middleware/auth.ts —
    // server-only code, but tanstack-start's import-protection plugin
    // crawls every entry on dev startup and tries to resolve `/node`
    // against browser export conditions. ext-bridge declares `./node`
    // only for the `node` condition, so that scan crashes with
    // `"./node" is not exported under the conditions ["module", "browser", ...]`,
    // Vite reports `Failed to run dependency scan. Skipping dependency
    // pre-bundling`, and *no* dep gets prebundled — every module falls
    // back to lazy single-file fetches. That cascade is what later
    // explodes on `node:async_hooks` (serverFnFetcher loads raw) and
    // also what makes the iframe handshake time out from sheer fan-out.
    // Excluding the /node subpath from the dep-scan tells Vite "this
    // is server-only, don't try to bundle it for the client".
    exclude: ['@mittwald/ext-bridge/node'],
    // Force-prebundle every heavy dep we know we need on the SSR/hydration
    // path. Without this list Vite discovers them lazily at first request
    // and serves dozens of single module files — over zrok the cumulative
    // round-trip latency blows past mStudio's bridge handshake budget
    // (empirically ~10s before the iframe gives up with
    // "RemoteError: Could not establish remote connection").
    //
    // zod v4 contributes ~80 individual locale files; @mittwald/ext-bridge
    // adds another ~10 small files — both were the dominant fan-out.
    // ext-bridge stays in `ssr.external` below (it is browser-only), but
    // that is independent of client-side dev prebundling.
    include: [
      'zod',
      'zod/v4',
      'zod/v4/locales',
      // ext-bridge has no root export — only subpaths. We use /browser
      // (client) and /i18next (i18next plugin); /node is server-only and
      // covered by ssr.external.
      '@mittwald/ext-bridge/browser',
      '@mittwald/ext-bridge/i18next',
      '@mittwald/flow-remote-react-components',
      '@mittwald/mstudio-ext-react-components',
      '@mittwald/api-client',
      '@mittwald/react-ghostmaker',
      '@tanstack/react-query',
      '@tanstack/react-router',
      '@tanstack/react-start',
      // NOTE: Do NOT add the transitive tanstack packages here
      // (router-core, start-client-core, react-start-client, history).
      // Forcing them as separate prebundled chunks creates duplicate
      // module instances; tanstack-start's internal Router/StartOptions
      // singletons then resolve to different copies on each side and
      // `hydrateStart` blows up with
      //   "Cannot read properties of undefined (reading 'options')".
      // Vite discovers them automatically via the parents listed above,
      // which keeps the singleton intact.
      'react',
      'react-dom',
      'react-i18next',
      'i18next',
    ],
    // Vite 8 uses Rolldown for the optimizer. The old `esbuildOptions`
    // key is deprecated and silently ignored.
    rolldownOptions: {
      resolve: {
        // tanstack-start ships 'import' / 'browser' export conditions
        // that the prebundler must follow to avoid pulling server-only
        // submodules (e.g. start-client-core's serverFnFetcher).
        conditionNames: ['browser', 'module', 'import'],
        // The optimizer has its own resolve pipeline that does NOT
        // inherit `environments.client.resolve.alias`, so the same
        // browser stubs have to be wired up again here. Without this
        // the prebundled @tanstack/react-start chunk would still hit
        // Vite's built-in throwing browser stub for node:async_hooks.
        alias: BROWSER_ALIASES,
      },
    },
  },
  server: {
    allowedHosts: true,
    port: 3000,
    // zrok exposes the dev server over HTTPS, so the HMR websocket has
    // to advertise port 443 to the iframe — otherwise the client tries
    // to reconnect to ws://<zrok-host>:3000 and that endpoint is not
    // tunneled. A failed HMR socket is non-fatal but adds ~2s of
    // reconnect noise into the bridge handshake budget.
    hmr: { clientPort: 443 },
    // Pre-transform our hot-path source files at server start so the first
    // request from the iframe doesn't pay the per-file transform cost.
    warmup: {
      clientFiles: [
        './src/start.ts',
        './src/router.tsx',
        './src/routes/__root.tsx',
        './src/routes/index.tsx',
        './src/i18n/index.ts',
        './src/components/dashboard/DashboardShell.tsx',
        './src/components/wizard/WizardShell.tsx',
      ],
    },
  },
  ssr: {
    external: ['@mittwald/ext-bridge'],
  },
  plugins: [
    tanstackStart(),
    nitro({
      preset: 'node-server',
      externals: {
        exportConditions: ['node', 'import', 'module', 'default'],
      },
      scanDirs: ['src/server'],
    }),
    react(),
  ],
})
