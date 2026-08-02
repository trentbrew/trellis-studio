import { createSimpleContext } from "./helper"
import type { MountWhiteboardEmbedFn } from "../components/markdown"

export const {
  use: useWhiteboardEmbedMount,
  useOptional: useWhiteboardEmbedMountOptional,
  provider: WhiteboardEmbedMountProvider,
} = createSimpleContext({
  name: "WhiteboardEmbedMount",
  init: (props: { mount?: MountWhiteboardEmbedFn }) => props.mount,
})
