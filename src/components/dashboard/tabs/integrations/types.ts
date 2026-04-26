import type { FC } from 'react'

export interface IntegrationProps {
  pullZoneId: number
  cdnDomain: string
  cdnMode: 'asset' | 'full-site'
}

export interface Integration {
  id: string
  /** Display name shown as the accordion heading, e.g. "TYPO3", "Shopware 6" */
  name: string
  component: FC<IntegrationProps>
}
