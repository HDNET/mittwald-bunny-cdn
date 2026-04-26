import { useEffect, useRef, useState } from 'react'
import type { SettingsPatch } from '~/shared/types'
import { applyPatch } from './apply-patch'

interface Options {
  onPatched: () => void
  onError: (message: string) => void
  debounceMs?: number
}

/**
 * Manages a single setting with optimistic UI + debounced persistence.
 *
 * - UI updates immediately (no waiting for the ~300ms Bunny round-trip)
 * - Rapid consecutive changes collapse into one persist call via debounce
 * - On persist error, the local value rolls back to the current server value
 * - When the server value changes externally (e.g. after a mutation invalidates
 *   the ghost cache), the hook re-syncs its local state
 */
export function useOptimisticSetting<T>(
  serverValue: T,
  toPatch: (next: T) => SettingsPatch,
  { onPatched, onError, debounceMs = 250 }: Options,
): [T, (next: T) => void] {
  const [local, setLocal] = useState(serverValue)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevServerRef = useRef(serverValue)

  useEffect(() => {
    if (serverValue !== prevServerRef.current) {
      prevServerRef.current = serverValue
      setLocal(serverValue)
      // If an external change lands while we still have a pending debounced
      // patch for a stale value, cancel it — the server is now authoritative.
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [serverValue])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  function set(next: T) {
    setLocal(next)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const patch = toPatch(next)
    timeoutRef.current = setTimeout(() => {
      void applyPatch(patch, onPatched, (message) => {
        setLocal(serverValue)
        onError(message)
      })
    }, debounceMs)
  }

  return [local, set]
}
