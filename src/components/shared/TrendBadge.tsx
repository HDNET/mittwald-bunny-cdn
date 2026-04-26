import { Badge } from '@mittwald/flow-remote-react-components'

type Direction = 'higherIsBetter' | 'higherIsWorse' | 'neutral'

interface Props {
  current: number
  previous: number | null | undefined
  direction?: Direction
}

function computeTrend(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  return pct
}

function badgeColor(pct: number, direction: Direction): 'green' | 'orange' | 'red' | 'neutral' {
  if (Math.abs(pct) < 0.5) return 'neutral'
  const isUp = pct > 0
  if (direction === 'neutral') return 'neutral'
  const isGood = (direction === 'higherIsBetter' && isUp) || (direction === 'higherIsWorse' && !isUp)
  return isGood ? 'green' : 'orange'
}

export function TrendBadge({ current, previous, direction = 'higherIsBetter' }: Props) {
  const pct = computeTrend(current, previous)
  if (pct === null) return null
  const arrow = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '●'
  const formatted = `${arrow} ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
  return <Badge color={badgeColor(pct, direction)}>{formatted}</Badge>
}
