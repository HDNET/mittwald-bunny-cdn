import {
  extensionAddedToContextKind,
  type extensionAddedToContextWebhookSchema,
  instanceRemovedKind,
  type instanceRemovedWebhookSchema,
  instanceUpdatedKind,
  type instanceUpdatedWebhookSchema,
  secretRotatedKind,
  type secretRotatedWebhookSchema,
  webhookSchema,
} from '@weissaufschwarz/mitthooks/schemas.js'

// Payload types inferred from the mitthooks zod schemas. Deriving them
// prevents drift between our handler code and the canonical webhook
// contract — see the failure mode fixed in commit 000eaa6, where a
// manually-typed kind string (`ExtensionInstanceRemovedFromContext`)
// never matched the actual wire value (`InstanceRemovedFromContext`)
// and uninstall webhooks silently retried forever.

export type ExtensionAddedPayload = ReturnType<typeof extensionAddedToContextWebhookSchema.parse>
export type InstanceUpdatedPayload = ReturnType<typeof instanceUpdatedWebhookSchema.parse>
export type SecretRotatedPayload = ReturnType<typeof secretRotatedWebhookSchema.parse>
export type InstanceRemovedPayload = ReturnType<typeof instanceRemovedWebhookSchema.parse>
export type WebhookPayload = ReturnType<typeof webhookSchema.parse>

export { extensionAddedToContextKind, instanceRemovedKind, instanceUpdatedKind, secretRotatedKind, webhookSchema }
