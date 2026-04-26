// Browser stub for @mittwald/ext-bridge/node. Loaded only when Vite walks
// the module graph in the *client* environment (e.g. tanstack-start's
// dev-styles plugin scanning files for transitive CSS imports). The
// underlying file (src/middleware/auth.ts) only runs server-side at
// runtime, so the stub never actually executes — it just satisfies the
// resolver so the dev-server doesn't crash with
//   "./node" is not exported under conditions ["module","browser",...]
//
// SSR keeps the real module via the environments.ssr override in
// vite.config.ts.

const serverOnly = (name) => () => {
  throw new Error(
    `@mittwald/ext-bridge/node.${name} called from a browser context — this is the dev-mode stub. The real implementation only runs on the server.`,
  )
}

export const getAccessToken = serverOnly('getAccessToken')
export const verify = serverOnly('verify')
