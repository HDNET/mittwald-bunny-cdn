// Browser stub for node:async_hooks. Loaded only in client/dev contexts
// via resolve.alias in vite.config.ts. The server build keeps the real
// Node module via ssr.external below in the same config.
//
// tanstack-start-client-core's serverFnFetcher imports
// `node:async_hooks` for an AsyncLocalStorage that's only ever exercised
// on the server, but Rolldown prebundles the chunk for the client too,
// and Vite's default browser stub makes the AsyncLocalStorage getter
// throw — which kills hydration. A working no-op class lets the import
// resolve without breaking; if the code path actually executes on the
// client the calls become no-ops.

export class AsyncLocalStorage {
  getStore() {
    return undefined
  }
  run(_store, fn, ...args) {
    return fn(...args)
  }
  enterWith() {}
  disable() {}
  exit(fn, ...args) {
    return fn(...args)
  }
}

export class AsyncResource {
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.apply(thisArg, args)
  }
  bind(fn) {
    return fn
  }
  emitDestroy() {
    return this
  }
  asyncId() {
    return 0
  }
  triggerAsyncId() {
    return 0
  }
}

export function executionAsyncId() {
  return 0
}
export function triggerAsyncId() {
  return 0
}
export function executionAsyncResource() {
  return {}
}
export function createHook() {
  return {
    enable() {
      return this
    },
    disable() {
      return this
    },
  }
}

export default {
  AsyncLocalStorage,
  AsyncResource,
  executionAsyncId,
  triggerAsyncId,
  executionAsyncResource,
  createHook,
}
