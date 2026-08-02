import { createEffect, createSignal, onCleanup } from "solid-js"
import { makeTimer } from "@solid-primitives/timer"

/**
 * Debounced effect for UI updates to prevent excessive re-renders
 * during rapid state changes (like streaming responses)
 */
export function createDebouncedEffect(
  deps: () => any[],
  fn: () => void,
  delay = 16, // ~60fps
) {
  const [debounced, setDebounced] = createSignal(0)
  let timeout: ReturnType<typeof setTimeout> | undefined

  const trigger = () => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      fn()
      setDebounced(Date.now())
    }, delay)
  }

  createEffect(() => {
    const current = deps()
    trigger()
    return current
  })

  onCleanup(() => {
    if (timeout) clearTimeout(timeout)
  })

  return debounced
}

/**
 * Creates a reliable update mechanism that ensures UI consistency
 * by batching rapid updates and providing fallback states
 */
export function createReliableUpdate<T>(
  initial: T,
  options?: {
    debounceMs?: number
    maxStaleMs?: number
    onStale?: (value: T) => void
  },
) {
  const { debounceMs = 16, maxStaleMs = 5000, onStale } = options ?? {}

  const [value, setValue] = createSignal<T>(initial)
  const [lastUpdate, setLastUpdate] = createSignal(Date.now())
  let staleTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const update = (newValue: T) => {
    // Clear existing timers
    if (debounceTimer) clearTimeout(debounceTimer)
    if (staleTimer) clearTimeout(staleTimer)

    // Debounce the actual update
    debounceTimer = setTimeout(() => {
      setValue(() => newValue)
      setLastUpdate(Date.now())

      // Set stale detection
      staleTimer = setTimeout(() => {
        if (Date.now() - lastUpdate() > maxStaleMs) {
          onStale?.(newValue)
        }
      }, maxStaleMs)
    }, debounceMs)
  }

  const force = (newValue: T) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (staleTimer) clearTimeout(staleTimer)

    setValue(() => newValue)
    setLastUpdate(Date.now())
  }

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (staleTimer) clearTimeout(staleTimer)
  })

  return [value, update, force] as const
}

/**
 * Error boundary for UI components that provides fallback rendering
 * and automatic retry mechanisms
 */
export function createErrorBoundary<T>(
  fallback: T,
  options?: {
    maxRetries?: number
    retryDelay?: number
    onError?: (error: Error, retryCount: number) => void
  },
) {
  const { maxRetries = 3, retryDelay = 1000, onError } = options ?? {}

  const [state, setState] = createSignal<{
    status: "ok" | "error" | "retrying"
    error?: Error
    retryCount: number
  }>({ status: "ok", retryCount: 0 })

  const execute = async <R>(fn: () => Promise<R>): Promise<R | T> => {
    try {
      const result = await fn()
      setState({ status: "ok", retryCount: 0 })
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const current = state()

      if (current.retryCount < maxRetries) {
        setState({ status: "retrying", error, retryCount: current.retryCount + 1 })
        onError?.(error, current.retryCount + 1)

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        return execute(fn) // Recursive retry
      } else {
        setState({ status: "error", error, retryCount: 0 })
        onError?.(error, 0)
        return fallback as T
      }
    }
  }

  const reset = () => {
    setState({ status: "ok", retryCount: 0 })
  }

  return [state, execute, reset] as const
}

/**
 * Creates a synchronized state manager that coordinates updates
 * across multiple components to prevent race conditions
 */
export function createSyncedState<T>(initial: T) {
  const [state, setState] = createSignal<T>(initial)
  const [version, setVersion] = createSignal(0)
  const pending = new Set<string>()

  const update = (key: string, fn: (prev: T) => T) => {
    if (pending.has(key)) return

    pending.add(key)
    try {
      setState((prev) => fn(prev))
      setVersion((v) => v + 1)
    } finally {
      pending.delete(key)
    }
  }

  const updateAsync = async (key: string, fn: (prev: T) => Promise<T>) => {
    if (pending.has(key)) return

    pending.add(key)
    try {
      const result = await fn(state())
      setState(() => result)
      setVersion((v) => v + 1)
    } finally {
      pending.delete(key)
    }
  }

  return {
    state,
    version,
    update,
    updateAsync,
    isPending: (key: string) => pending.has(key),
  }
}
