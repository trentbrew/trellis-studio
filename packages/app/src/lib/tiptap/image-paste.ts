import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

type SaveFn = (file: File) => Promise<string | undefined>

export const ImagePaste = Extension.create<{ save: SaveFn }>({
  name: "imagePaste",

  addOptions() {
    return {
      save: async () => undefined,
    }
  },

  addProseMirrorPlugins() {
    const save = this.options.save
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("imagePaste"),
        props: {
          handlePaste(_, event) {
            const items = event.clipboardData?.items
            if (!items) return false
            for (const item of Array.from(items)) {
              if (!item.type.startsWith("image/")) continue
              const file = item.getAsFile()
              if (!file) continue
              event.preventDefault()
              save(file).then((src) => {
                if (!src) return
                ;(editor.chain().focus() as any).setImage({ src }).run()
              })
              return true
            }
            return false
          },
          handleDrop(_, event) {
            const files = event.dataTransfer?.files
            if (!files?.length) return false
            for (const file of Array.from(files)) {
              if (!file.type.startsWith("image/")) continue
              event.preventDefault()
              save(file).then((src) => {
                if (!src) return
                ;(editor.chain().focus() as any).setImage({ src }).run()
              })
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})
