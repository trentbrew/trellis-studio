import { showToast } from "@opencode-ai/ui/toast"
import { useFile, useFileOptional } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useSync, useSyncOptional } from "@/context/sync"
import { useTrellisOptional } from "@/context/trellis"
import { useTrellisStoreOptional } from "@/context/trellis-store"
import { mentionTrellisCtx } from "@/lib/mention-trellis"
import { searchMentions } from "@/lib/mention-search"
import { useEntityLinkNav } from "@/lib/use-entity-link-nav"

const EMPTY_SYNC = { data: { agent: [] as Array<{ name: string }> } }
const EMPTY_FILE = { searchFiles: async () => [] as string[] }

export function useMentionCallbacks() {
  const file = useFile()
  const sync = useSync()
  const sdk = useSDK()
  const trellis = useTrellisOptional()
  const trellisStore = useTrellisStoreOptional()
  const { mentionNavigate } = useEntityLinkNav()

  return {
    search: (query: string) =>
      searchMentions({ query, file, sync, trellis: mentionTrellisCtx(trellis, trellisStore?.facts) }),
    fetch: async (id: string, type: string) => {
      if (type !== "file") return undefined
      await file.load(id)
      return file.text(id)
    },
    navigate: mentionNavigate,
    onCreate: async (rel: string) => {
      try {
        await sdk.client.file.write({ fileWriteInput: { path: rel, content: "", format: false } })
        const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ""
        await file.tree.refresh(parent)
        if (parent) file.tree.expand(parent)
        showToast({ variant: "success", title: `Created ${rel}` })
        return rel
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        showToast({ variant: "error", title: "Create failed", description: msg })
        return undefined
      }
    },
  }
}

export function useMentionCallbacksOptional() {
  const file = useFileOptional()
  const sync = useSyncOptional()
  const sdk = useSDK()
  const trellis = useTrellisOptional()
  const trellisStore = useTrellisStoreOptional()
  const { mentionNavigate } = useEntityLinkNav()

  return {
    search: (query: string) =>
      searchMentions({
        query,
        file: file ?? EMPTY_FILE,
        sync: sync ?? EMPTY_SYNC,
        trellis: mentionTrellisCtx(trellis, trellisStore?.facts),
      }),
    fetch: async (id: string, type: string) => {
      if (type !== "file") return undefined
      if (file) {
        await file.load(id)
        return file.text(id)
      }
      const result = await sdk.client.file.read({ path: id }).catch(() => undefined)
      const hit = result?.data
      if (!hit || hit.type !== "text" || hit.encoding === "base64") return undefined
      return hit.content
    },
    navigate: mentionNavigate,
    onCreate: async (rel: string) => {
      try {
        await sdk.client.file.write({ fileWriteInput: { path: rel, content: "", format: false } })
        if (file) {
          const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ""
          await file.tree.refresh(parent)
          if (parent) file.tree.expand(parent)
        }
        showToast({ variant: "success", title: `Created ${rel}` })
        return rel
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        showToast({ variant: "error", title: "Create failed", description: msg })
        return undefined
      }
    },
  }
}
