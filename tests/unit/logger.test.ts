import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `createLogger` reads NODE_ENV at module-load time, so we re-import via
// dynamic import after toggling the env to test the production JSON path.
async function loadLoggerWithEnv(env: 'development' | 'production') {
  vi.resetModules()
  const original = process.env.NODE_ENV
  process.env.NODE_ENV = env
  const mod = await import('~/server/logger.js')
  process.env.NODE_ENV = original
  return mod
}

describe('createLogger — dev mode', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits human-readable lines with module prefix', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    const log = createLogger('test')
    log.info('hello')
    expect(infoSpy).toHaveBeenCalledWith('[test]', 'hello')
  })

  it('routes warn to console.warn and error to console.error', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    const log = createLogger('test')
    log.warn('caution')
    log.error('boom')
    expect(warnSpy).toHaveBeenCalledWith('[test]', 'caution')
    expect(errorSpy).toHaveBeenCalledWith('[test]', 'boom')
  })

  it('appends extra payload as JSON when provided', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    const log = createLogger('test')
    log.info('msg', { foo: 'bar' })
    expect(infoSpy).toHaveBeenCalledWith('[test]', 'msg {"foo":"bar"}')
  })
})

describe('createLogger — production mode (JSON lines)', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits a single JSON line with level, msg, module, ts', async () => {
    const { createLogger } = await loadLoggerWithEnv('production')
    const log = createLogger('mod')
    log.info('hi')

    expect(infoSpy).toHaveBeenCalledTimes(1)
    const line = infoSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({ level: 'info', msg: 'hi', module: 'mod' })
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('routes warn/error through console.warn/console.error', async () => {
    const { createLogger } = await loadLoggerWithEnv('production')
    const log = createLogger('mod')
    log.warn('w')
    log.error('e')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(warnSpy.mock.calls[0][0] as string).level).toBe('warn')
    expect(JSON.parse(errorSpy.mock.calls[0][0] as string).level).toBe('error')
  })
})

describe('logger redaction (dev mode is enough — same redact path is shared)', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redacts top-level secret-named fields', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    createLogger('m').info('msg', { apiKey: 'a-real-key', other: 'fine' })
    const out = infoSpy.mock.calls[0][1] as string
    expect(out).toContain('[REDACTED]')
    expect(out).not.toContain('a-real-key')
    expect(out).toContain('fine')
  })

  it('redacts nested secret-named fields', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    createLogger('m').info('msg', { headers: { authorization: 'Bearer xyz' } })
    const out = infoSpy.mock.calls[0][1] as string
    expect(out).toContain('[REDACTED]')
    expect(out).not.toContain('xyz')
  })

  it('redacts fields inside arrays of objects', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    createLogger('m').info('msg', { entries: [{ token: 'leak-me' }, { ok: 1 }] })
    const out = infoSpy.mock.calls[0][1] as string
    expect(out).not.toContain('leak-me')
  })

  it('matches case-insensitively (Authorization, API_KEY, Password)', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    createLogger('m').info('msg', { API_KEY: 'x', Password: 'y', Authorization: 'z' })
    const out = infoSpy.mock.calls[0][1] as string
    expect(out).not.toContain('"x"')
    expect(out).not.toContain('"y"')
    expect(out).not.toContain('"z"')
  })

  it('wraps non-object extras under a `value` key (still redacted recursively)', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    createLogger('m').info('msg', 'just a string')
    const out = infoSpy.mock.calls[0][1] as string
    expect(out).toContain('"value":"just a string"')
  })

  it('omits extras when undefined or null', async () => {
    const { createLogger } = await loadLoggerWithEnv('development')
    createLogger('m').info('plain')
    expect(infoSpy.mock.calls[0][1]).toBe('plain')
  })
})
