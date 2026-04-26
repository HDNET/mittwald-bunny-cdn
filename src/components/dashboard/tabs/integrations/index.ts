import { Typo3Integration } from './Typo3Integration'
import type { Integration } from './types'

/**
 * Registry of CMS/shop integrations. Each entry provides CDN-specific
 * configuration guidance and caching recommendations for that application.
 *
 * To add a new integration: create `Xxx/Integration.tsx` following the
 * IntegrationProps contract, then append it to this array. It will show
 * up automatically in the "Integration" tab.
 */
export const INTEGRATIONS: Integration[] = [
  {
    id: 'typo3',
    name: 'TYPO3',
    component: Typo3Integration,
  },
]

export type { Integration, IntegrationProps } from './types'
