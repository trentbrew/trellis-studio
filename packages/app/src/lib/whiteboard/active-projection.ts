import { createSignal } from "solid-js"

/** Path of the whiteboard open in the Whiteboards projection fullscreen editor. */
const [path, setPath] = createSignal<string | null>(null)

export const projectionWhiteboard = {
  path,
  set: setPath,
}
