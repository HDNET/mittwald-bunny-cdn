/**
 * Lightweight structured logger for container environments.
 *
 * In production, outputs JSON lines (one object per line) so log aggregators
 * (Loki, CloudWatch, Datadog) can parse fields without regex. In development,
 * falls back to human-readable console output for DX.
 *
 * No external dependencies — uses only `console.*` and `JSON.stringify`.
 */

type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  msg: string
  module: string
  [key: string]: unknown
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Field-name redaction: any object key that names a credential is replaced
// with `[REDACTED]`. The primary control is still per-call-site redaction
// (`redactApiKey(...)` in `bunnycdn.ts`); this is the safety net for the case
// where someone passes a raw object containing one of these keys to the
// logger by accident.
const SECRET_KEY_PATTERN = /^(api_?key|secret|password|token|access_?key|authorization|encrypted_?api_?key)$/i

function redactValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactValue)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[REDACTED]' : redactValue(val)
    }
    return out
  }
  return v
}

function normalizeExtra(extra: unknown): Record<string, unknown> {
  if (extra === undefined || extra === null) return {}
  if (typeof extra === 'object' && !Array.isArray(extra)) return redactValue(extra) as Record<string, unknown>
  return { value: redactValue(extra) }
}

function emit(entry: LogEntry): void {
  if (IS_PRODUCTION) {
    const line = JSON.stringify({ ...entry, ts: new Date().toISOString() })
    switch (entry.level) {
      case 'error':
        console.error(line)
        break
      case 'warn':
        console.warn(line)
        break
      default:
        console.info(line)
    }
  } else {
    const prefix = `[${entry.module}]`
    const { level: _, msg, module: __, ...extra } = entry
    const suffix = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : ''
    switch (entry.level) {
      case 'error':
        console.error(prefix, msg + suffix)
        break
      case 'warn':
        console.warn(prefix, msg + suffix)
        break
      default:
        console.info(prefix, msg + suffix)
    }
  }
}

export interface Logger {
  info(msg: string, extra?: unknown): void
  warn(msg: string, extra?: unknown): void
  error(msg: string, extra?: unknown): void
}

/**
 * Creates a logger scoped to a module name.
 *
 * @example
 * const log = createLogger('bunnycdn')
 * log.info('Creating pull zone', { name, originUrl })
 * log.error('API call failed', { status: 500, path: '/pullzone' })
 */
export function createLogger(module: string): Logger {
  return {
    info: (msg, extra) => emit({ level: 'info', msg, module, ...normalizeExtra(extra) }),
    warn: (msg, extra) => emit({ level: 'warn', msg, module, ...normalizeExtra(extra) }),
    error: (msg, extra) => emit({ level: 'error', msg, module, ...normalizeExtra(extra) }),
  }
}
