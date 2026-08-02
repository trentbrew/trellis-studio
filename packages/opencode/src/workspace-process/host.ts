import { createHash } from "crypto"
import { Instance } from "@/project/instance"

export function hostIdForDirectory(directory: string): string {
  const hash = createHash("sha256").update(directory).digest("hex").slice(0, 16)
  return `host:${hash}`
}

export function hostIdForInstance(): string {
  return hostIdForDirectory(Instance.directory)
}

export function processId(hostId: string, port: number): string {
  return `process:${hostId}:${port}`
}
