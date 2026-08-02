import { WhiteboardEmbedMountProvider } from "@opencode-ai/ui/context/whiteboard-embed"
import type { ParentProps } from "solid-js"
import { createMemo } from "solid-js"
import { useSDK } from "@/context/sdk"
import { createWhiteboardEmbedMount } from "@/lib/whiteboard/markdown-embed-mount"
import { dispatchProjectionFocus } from "@/lib/projection-focus"

export function WhiteboardEmbedProvider(props: ParentProps) {
  const sdk = useSDK()

  const mount = createMemo(() =>
    createWhiteboardEmbedMount({
      fetchFile: async (path) => {
        const result = await sdk.client.file.read({ path }).catch(() => undefined)
        const file = result?.data
        if (!file || file.type !== "text" || file.encoding === "base64") return undefined
        return file.content
      },
      onOpen: (path) => {
        dispatchProjectionFocus({ lens: "whiteboards", path })
      },
    }),
  )

  return <WhiteboardEmbedMountProvider mount={mount()}>{props.children}</WhiteboardEmbedMountProvider>
}
