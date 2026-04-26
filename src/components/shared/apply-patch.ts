import { updateSettings } from '~/lib/bunny-cdn-api'
import type { SettingsPatch } from '~/shared/types'

/**
 * Applies a settings patch via the BunnyCDN API adapter. Resolves on success,
 * calls onError with a human-readable message on failure.
 */
export async function applyPatch(
  patch: SettingsPatch,
  onPatched: () => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    await updateSettings(patch)
    onPatched()
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Fehler beim Speichern')
  }
}
