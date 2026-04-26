import { defineEventHandler, setHeaders } from 'nitro/h3'

const MITTWALD_FRAME_ANCESTORS = ['https://*.mittwald.de', 'https://*.mittwald.systems', 'https://*.mittwald.it']

const DEV_FRAME_ANCESTORS = ['http://localhost:*', 'https://*.share.zrok.io']

export function buildCsp(isDev: boolean): string {
  const frameAncestors = isDev ? [...MITTWALD_FRAME_ANCESTORS, ...DEV_FRAME_ANCESTORS] : MITTWALD_FRAME_ANCESTORS

  return [
    "default-src 'self'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
    // tanstack-start emits a small set of inline <script> tags into the SSR
    // HTML for streaming hydration — `$tsr-stream-barrier` plus the dynamic
    // `import("/@id/virtual:tanstack-start-client-entry")` bootstrap. Without
    // 'unsafe-inline' the browser blocks them, hydration never runs, and
    // mStudio's remote-renderer-bridge times out with
    // "Could not establish remote connection". Both dev and prod need it.
    // Future hardening: switch to a per-request nonce once tanstack-start
    // exposes a hook for it.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.bunny.net https://api.mittwald.de",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

// Permissions-Policy — stick to features every evergreen browser knows, to avoid
// noisy "Unrecognized feature" console warnings for users on older browsers.
// `interest-cohort` was removed from the spec when FLoC was abandoned; newer
// Privacy-Sandbox features (browsing-topics etc.) are still in origin trial,
// so we leave them to the host frame to gate rather than duplicating here.
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'

/**
 * Pure helper returning the full set of response headers for a given mode.
 * Exported so the h3 middleware below and the unit test both call the same
 * thing — the middleware is just `setHeaders(event, buildSecurityHeaders(...))`.
 */
export function buildSecurityHeaders(isDev: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': buildCsp(isDev),
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  }
}

export default defineEventHandler((event) => {
  const isDev = process.env.NODE_ENV !== 'production'
  setHeaders(event, buildSecurityHeaders(isDev))
})
