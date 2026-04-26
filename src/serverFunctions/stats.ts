import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '~/middleware/auth'
import { bunnyRequest } from '~/server/bunnycdn'
import { decrypt } from '~/server/crypto'
import { getDb } from '~/server/db/index'
import { extensionInstances, pullZones } from '~/server/db/schema'
import { createLogger } from '~/server/logger.js'
import { getCached, setCached } from '~/server/stats-cache'

const log = createLogger('api')

interface BunnyStatsResponse {
  TotalBandwidthUsed?: number
  TotalRequestsServed?: number
  CacheHitRate?: number
  AverageOriginResponseTime?: number
  BandwidthUsedChart?: Record<string, number>
  RequestsServedChart?: Record<string, number>
  CacheHitRateChart?: Record<string, number>
  GeoTrafficDistribution?: Record<string, number>
}

async function fetchBunnyStats(pullZoneId: number, from: string, to: string, apiKey: string) {
  return bunnyRequest<BunnyStatsResponse>(`/statistics?dateFrom=${from}&dateTo=${to}&pullZone=${pullZoneId}`, apiKey)
}

function toTimeSeries(chart: Record<string, number> | undefined): Array<{ date: string; value: number }> {
  if (!chart) return []
  return Object.entries(chart)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function toTopCountries(
  dist: Record<string, number> | undefined,
  limit: number,
): Array<{ country: string; bandwidth: number }> {
  if (!dist) return []
  return Object.entries(dist)
    .map(([country, bandwidth]) => ({ country, bandwidth }))
    .sort((a, b) => b.bandwidth - a.bandwidth)
    .slice(0, limit)
}

function monthBounds(offset = 0): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + offset
  const start = new Date(year, month, 1)
  const end = offset === 0 ? now : new Date(year, month + 1, 0)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { from: fmt(start), to: fmt(end) }
}

async function buildStatsPayload(pullZoneId: number, apiKey: string) {
  const current = monthBounds(0)
  const previous = monthBounds(-1)
  const [currentStats, previousStats, billingRes] = await Promise.all([
    fetchBunnyStats(pullZoneId, current.from, current.to, apiKey),
    fetchBunnyStats(pullZoneId, previous.from, previous.to, apiKey).catch(() => null),
    bunnyRequest<{ Balance?: number; ThisMonthCharges?: number; MonthlyBandwidthUsed?: number }>('/billing', apiKey),
  ])

  return {
    bandwidth: currentStats.TotalBandwidthUsed ?? 0,
    requests: currentStats.TotalRequestsServed ?? 0,
    cacheHitRate: currentStats.CacheHitRate ?? 0,
    avgResponseTime: currentStats.AverageOriginResponseTime ?? 0,
    balance: billingRes.Balance ?? 0,
    monthlyCharges: billingRes.ThisMonthCharges ?? 0,
    monthlyBandwidth: billingRes.MonthlyBandwidthUsed ?? 0,
    series: {
      bandwidth: toTimeSeries(currentStats.BandwidthUsedChart),
      requests: toTimeSeries(currentStats.RequestsServedChart),
      cacheHitRate: toTimeSeries(currentStats.CacheHitRateChart),
    },
    topCountries: toTopCountries(currentStats.GeoTrafficDistribution, 5),
    previous: previousStats
      ? {
          bandwidth: previousStats.TotalBandwidthUsed ?? 0,
          requests: previousStats.TotalRequestsServed ?? 0,
          cacheHitRate: previousStats.CacheHitRate ?? 0,
        }
      : null,
  }
}

export const getStatsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { extensionInstanceId: string } }) => {
    const db = getDb()
    const instance = db
      .select()
      .from(extensionInstances)
      .where(eq(extensionInstances.id, context.extensionInstanceId))
      .get()
    if (!instance?.encryptedApiKey) return null

    const pullZone = db.select().from(pullZones).where(eq(pullZones.instanceId, context.extensionInstanceId)).get()
    if (!pullZone) return null

    const cached = getCached<Awaited<ReturnType<typeof buildStatsPayload>>>(pullZone.id)
    if (cached) return cached

    try {
      const payload = await buildStatsPayload(pullZone.id, decrypt(instance.encryptedApiKey))
      setCached(pullZone.id, payload)
      return payload
    } catch (statsError) {
      log.warn('[api] Stats fetch failed (non-fatal):', statsError instanceof Error ? statsError.message : statsError)
      return null
    }
  })
