/**
 * Phase 2 (TRL-9): host resource metrics as telemetry events, not graph facts.
 *
 * Event name: `host.metrics`
 * Payload: { hostId, ts, cpu?, mem?, disk?, ... }
 *
 * Emit via trellis-cloud `track()` or studio `emitStudioTelemetry` — keyed by hostId
 * from {@link hostIdForDirectory}. Do not add cpu/mem fields to ComputeHost entities.
 */

export type HostMetricsSample = {
  hostId: string
  ts: number
  cpuPercent?: number
  memUsedBytes?: number
  memTotalBytes?: number
  diskUsedBytes?: number
  diskTotalBytes?: number
}

export function hostMetricsEventName() {
  return "host.metrics"
}
