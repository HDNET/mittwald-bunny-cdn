import { Badge } from '@mittwald/flow-remote-react-components'
import type { HealthStatus } from '~/shared/types'

interface Props {
  status: HealthStatus
  children: string
}

function statusColor(status: HealthStatus): 'green' | 'orange' | 'red' | 'neutral' {
  switch (status) {
    case 'ok':
      return 'green'
    case 'pending':
    case 'slow':
      return 'orange'
    case 'missing':
    case 'down':
      return 'red'
    default:
      return 'neutral'
  }
}

export function StatusDot({ status, children }: Props) {
  return <Badge color={statusColor(status)}>{children}</Badge>
}
