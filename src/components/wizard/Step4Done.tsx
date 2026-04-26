import {
  ActionGroup,
  Badge,
  Button,
  CodeBlock,
  Content,
  CopyButton,
  Flex,
  Heading,
  IllustratedMessage,
  InlineCode,
  LayoutCard,
  Text,
} from '@mittwald/flow-remote-react-components'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConfigHint, ConfigHintStatus, ConfigHints } from '~/shared/types'

interface Props {
  hints: ConfigHints
  onComplete: () => void
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface HighlightChunk {
  key: string
  text: string
  isCode: boolean
}

function buildChunks(text: string, terms: string[]): HighlightChunk[] {
  const pattern = new RegExp(terms.map(escapeRegex).join('|'), 'g')
  const chunks: HighlightChunk[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > cursor) {
      chunks.push({ key: `t-${cursor}`, text: text.slice(cursor, start), isCode: false })
    }
    chunks.push({ key: `c-${start}`, text: match[0], isCode: true })
    cursor = start + match[0].length
  }
  if (cursor < text.length) {
    chunks.push({ key: `t-${cursor}`, text: text.slice(cursor), isCode: false })
  }
  return chunks
}

/**
 * Renders text with specific substrings wrapped in <InlineCode>. Used to
 * highlight hostnames and DNS targets inside config-hint descriptions without
 * having to pre-split the copy server-side. Keys are tied to the character
 * offset of each chunk so re-renders are stable and never collide on duplicate
 * substrings.
 */
function HighlightedText({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms || terms.length === 0) return <Text>{text}</Text>
  const chunks = buildChunks(text, terms)
  return (
    <Text>
      {chunks.map((chunk) =>
        chunk.isCode ? (
          <InlineCode key={chunk.key}>{chunk.text}</InlineCode>
        ) : (
          <Fragment key={chunk.key}>{chunk.text}</Fragment>
        ),
      )}
    </Text>
  )
}

function StatusBadge({ status }: { status?: ConfigHintStatus }) {
  const { t } = useTranslation()
  if (status === 'ok') return <Badge color="green">{t('wizard.step4.statusBadge.ok')}</Badge>
  if (status === 'pending') return <Badge color="orange">{t('wizard.step4.statusBadge.pending')}</Badge>
  if (status === 'info') return <Badge color="blue">{t('wizard.step4.statusBadge.info')}</Badge>
  return null
}

function HintCard({ hint }: { hint: ConfigHint }) {
  const { t } = useTranslation()
  const title = t(hint.titleKey)
  const description = t(hint.descriptionKey, hint.descriptionValues ?? {})
  return (
    <LayoutCard>
      <Flex direction="column" gap="m">
        <Flex gap="s" align="center" wrap="wrap">
          <Heading>{title}</Heading>
          <StatusBadge status={hint.status} />
        </Flex>
        <HighlightedText text={description} terms={hint.highlights} />
        {hint.code && (
          <Flex direction="column" gap="xs">
            <CodeBlock>{hint.code}</CodeBlock>
            <CopyButton text={hint.code} />
          </Flex>
        )}
      </Flex>
    </LayoutCard>
  )
}

export function Step4Done({ hints, onComplete }: Props) {
  const { t } = useTranslation()
  const sections = [hints.dns, hints.typo3, hints.ssl, hints.cache, hints.redirect].filter(
    (h): h is NonNullable<typeof h> => !!h,
  )

  return (
    <>
      <LayoutCard>
        <IllustratedMessage>
          <Heading>{t('wizard.step4.heading')}</Heading>
          <Content>
            <Text>{t('wizard.step4.intro')}</Text>
          </Content>
        </IllustratedMessage>
      </LayoutCard>
      {sections.map((hint) => (
        <HintCard key={hint.titleKey} hint={hint} />
      ))}
      <LayoutCard>
        <ActionGroup>
          <Button onPress={onComplete}>{t('wizard.step4.toDashboard')}</Button>
        </ActionGroup>
      </LayoutCard>
    </>
  )
}
