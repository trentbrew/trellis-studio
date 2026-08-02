import { showToast } from "@opencode-ai/ui/toast"
import { useEntityNavigate } from "@/components/entity-detail/nav"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useTrellisOptional } from "@/context/trellis"
import { useTrellisStoreOptional } from "@/context/trellis-store"
import { mentionTrellisCtx } from "@/lib/mention-trellis"
import { searchMentions } from "@/lib/mention-search"

export function useMentionCallbacks() {
  const file = useFile()
  const sync = useSync()
  const sdk = useSDK()
  const trellis = useTrellisOptional()
  const trellisStore = useTrellisStoreOptional()
  const navigate = useEntityNavigate()

  return {
    search: (query: string) =>
      searchMentions({ query, file, sync, trellis: mentionTrellisCtx(trellis, trellisStore?.facts) }),
    fetch: async (id: string, type: string) => {
      if (type !== "file") return undefined
      await file.load(id)
      return file.text(id)
    },
    navigate: (attrs: { type: string; id: string }) => {
      if (attrs.type === "file") {
        navigate(`file:${attrs.id}`, "file")
        return
      }
      if (attrs.type === "entity") {
        navigate(attrs.id)
        return
      }
    },
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
