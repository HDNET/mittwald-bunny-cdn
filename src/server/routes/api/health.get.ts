import { defineEventHandler } from 'nitro/h3'
import { pingDb } from '~/server/db/index'

/**
 * Liveness + readiness probe for container orchestrators.
 *
 * GET /api/health → 200 { status: "ok", db: true, uptime: ... }
 *
 * Checks:
 * - Process is alive (implicit — if this handler runs, the process is up)
 * - SQLite is reachable (`pingDb()` runs a trivial `SELECT 1`)
 *
 * Intentionally does NOT call external services (bunny.net, mittwald API)
 * because a downstream outage should not make the container restart.
 */
export default defineEventHandler(() => {
  const dbOk = pingDb()
  const status = dbOk ? 'ok' : 'degraded'
  const statusCode = dbOk ? 200 : 503

  return new Response(
    JSON.stringify({
      status,
      db: dbOk,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
    {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
