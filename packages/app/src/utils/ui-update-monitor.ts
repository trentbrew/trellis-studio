import { createEffect, createSignal, onCleanup } from "solid-js"
import { makeTimer } from "@solid-primitives/timer"

/**
 * Monitors UI update performance and reliability
 * Provides metrics and alerts for update issues
 */
export function createUIUpdateMonitor() {
  const [metrics, setMetrics] = createSignal({
    totalUpdates: 0,
    slowUpdates: 0,
    failedUpdates: 0,
    averageUpdateTime: 0,
    lastUpdateTime: 0,
    updateTimes: [] as number[],
  })

  const [alerts, setAlerts] = createSignal<{
    warnings: string[]
    errors: string[]
  }>({ warnings: [], errors: [] })

  let monitoring = true
  const updateTimes: number[] = []
  const MAX_HISTORY = 100

  const startUpdate = () => {
    return performance.now()
  }

  const endUpdate = (startTime: number, success: boolean) => {
    if (!monitoring) return

    const duration = performance.now() - startTime
    updateTimes.push(duration)

    // Keep only recent history
    if (updateTimes.length > MAX_HISTORY) {
      updateTimes.shift()
    }

    const isSlow = duration > 16 // > 60fps threshold
    const newMetrics = {
      totalUpdates: metrics().totalUpdates + 1,
      slowUpdates: metrics().slowUpdates + (isSlow ? 1 : 0),
      failedUpdates: metrics().failedUpdates + (success ? 0 : 1),
      averageUpdateTime: updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length,
      lastUpdateTime: Date.now(),
      updateTimes: [...updateTimes],
    }

    setMetrics(newMetrics)

    // Generate alerts for performance issues
    if (isSlow) {
      addWarning(`Slow UI update: ${duration.toFixed(2)}ms`)
    }

    if (!success) {
      addError(`UI update failed`)
    }

    // Check for consistent performance degradation
    const recentSlow = updateTimes.slice(-10).filter((t) => t > 16).length
    if (recentSlow >= 7) {
      addWarning("Consistent slow UI updates detected")
    }
  }

  const addWarning = (message: string) => {
    setAlerts((prev) => ({
      ...prev,
      warnings: [...prev.warnings.slice(-9), message], // Keep last 10 warnings
    }))
  }

  const addError = (message: string) => {
    setAlerts((prev) => ({
      ...prev,
      errors: [...prev.errors.slice(-4), message], // Keep last 5 errors
    }))
  }

  const clearAlerts = () => {
    setAlerts({ warnings: [], errors: [] })
  }

  const getHealthScore = () => {
    const m = metrics()
    if (m.totalUpdates === 0) return 100

    const successRate = (m.totalUpdates - m.failedUpdates) / m.totalUpdates
    const speedScore = Math.max(0, 1 - m.averageUpdateTime / 16) // 16ms = 60fps
    const slowRate = 1 - m.slowUpdates / m.totalUpdates

    return Math.round((successRate * 0.4 + speedScore * 0.3 + slowRate * 0.3) * 100)
  }

  // Periodic health check
  const healthCheckTimer = makeTimer(
    () => {
      const score = getHealthScore()
      if (score < 70) {
        addWarning(`UI health score low: ${score}%`)
      }
    },
    10000,
    setInterval,
  ) // Check every 10 seconds

  onCleanup(() => {
    monitoring = false
    healthCheckTimer()
  })

  return {
    metrics,
    alerts,
    startUpdate,
    endUpdate,
    clearAlerts,
    getHealthScore,
  }
}

/**
 * Creates a wrapper for async operations that monitors performance
 */
export function createMonitoredOperation<T>(
  monitor: ReturnType<typeof createUIUpdateMonitor>,
  operation: () => Promise<T>,
  context?: string,
) {
  return async (): Promise<T> => {
    const start = monitor.startUpdate()
    try {
      const result = await operation()
      monitor.endUpdate(start, true)
      return result
    } catch (err) {
      monitor.endUpdate(start, false)
      if (context) {
        console.error(`Operation failed [${context}]:`, err)
      }
      throw err
    }
  }
}

/**
 * Global UI update monitor instance
 */
let globalMonitor: ReturnType<typeof createUIUpdateMonitor> | null = null

export function getGlobalUIUpdateMonitor() {
  if (!globalMonitor) {
    globalMonitor = createUIUpdateMonitor()
  }
  return globalMonitor
}

/**
 * Hook for components to monitor their update performance
 */
export function useUIUpdateMonitor() {
  return getGlobalUIUpdateMonitor()
}
