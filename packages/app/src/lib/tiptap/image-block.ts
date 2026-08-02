import Image from "@tiptap/extension-image"
import { isWhiteboardEmbedPath } from "@opencode-ai/ui/lib/whiteboard-embed"
import type { MountWhiteboardEmbedFn } from "@opencode-ai/ui/markdown"

type UploadFn = (file: File) => Promise<string | undefined>
type ResolveFn = (src: string) => string

const imageIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`

const uploadIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`

export const ImageBlock = Image.extend<{
  upload: UploadFn
  resolve: ResolveFn
  mountWhiteboardEmbed?: MountWhiteboardEmbedFn
}>({
  addOptions() {
    return {
      ...this.parent?.(),
      upload: async () => undefined,
      resolve: (src: string) => src,
      mountWhiteboardEmbed: undefined,
    }
  },

  addNodeView() {
    const upload = this.options.upload
    const resolve = this.options.resolve
    const mountWhiteboardEmbed = this.options.mountWhiteboardEmbed
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div")
      dom.setAttribute("data-component", "image-block")
      dom.contentEditable = "false"

      let current = node

      const pos = (): number | null => {
        if (typeof getPos !== "function") return null
        const p = getPos()
        return p === undefined ? null : p
      }

      const setSrc = (src: string) => {
        const p = pos()
        if (p === null) return
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(p, undefined, { ...current.attrs, src }))
      }

      const remove = () => {
        const p = pos()
        if (p === null) return
        const end = p + current.nodeSize
        editor.chain().focus().deleteRange({ from: p, to: end }).run()
      }

      const renderCard = () => {
        dom.innerHTML = ""

        const card = document.createElement("div")
        card.className = "image-placeholder-card"
        card.addEventListener("click", (e) => e.stopPropagation())

        const icon = document.createElement("div")
        icon.className = "image-placeholder-icon"
        icon.innerHTML = imageIcon
        card.appendChild(icon)

        const label = document.createElement("div")
        label.className = "image-placeholder-label"
        label.textContent = "Add image"
        card.appendChild(label)

        const row = document.createElement("div")
        row.className = "image-placeholder-row"

        const input = document.createElement("input")
        input.type = "url"
        input.placeholder = "Paste URL and press Enter…"
        input.className = "image-placeholder-input"
        input.addEventListener("click", (e) => e.stopPropagation())

        const commit = () => {
          const val = input.value.trim()
          if (!val) {
            remove()
            return
          }
          setSrc(val)
        }

        input.addEventListener("keydown", (e) => {
          e.stopPropagation()
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            remove()
          }
        })

        const fileInput = document.createElement("input")
        fileInput.type = "file"
        fileInput.accept = "image/*"
        fileInput.style.display = "none"

        const uploadBtn = document.createElement("button")
        uploadBtn.type = "button"
        uploadBtn.className = "image-placeholder-upload-btn"
        uploadBtn.innerHTML = uploadIcon + "<span>Upload</span>"
        uploadBtn.addEventListener("click", (e) => {
          e.stopPropagation()
          fileInput.click()
        })

        fileInput.addEventListener("change", async () => {
          const file = fileInput.files?.[0]
          if (!file) return
          uploadBtn.setAttribute("data-loading", "true")
          const btn = uploadBtn.querySelector("span")
          if (btn) btn.textContent = "Uploading…"
          const src = await upload(file)
          if (src) {
            setSrc(src)
          } else {
            uploadBtn.removeAttribute("data-loading")
            if (btn) btn.textContent = "Upload"
          }
        })

        row.appendChild(input)
        row.appendChild(uploadBtn)
        row.appendChild(fileInput)
        card.appendChild(row)
        dom.appendChild(card)

        requestAnimationFrame(() => input.focus())
      }

      let whiteboardCleanup: (() => void) | undefined

      const renderWhiteboard = (src: string) => {
        whiteboardCleanup?.()
        whiteboardCleanup = undefined
        dom.innerHTML = ""
        if (!mountWhiteboardEmbed) {
          const link = document.createElement("a")
          link.href = src
          link.className = "whiteboard-embed-fallback__card"
          link.textContent = src.split("/").pop() ?? "Whiteboard"
          dom.appendChild(link)
          return
        }
        whiteboardCleanup = mountWhiteboardEmbed(dom, src, current.attrs.alt || undefined)
      }

      const renderImage = (src: string) => {
        whiteboardCleanup?.()
        whiteboardCleanup = undefined
        dom.innerHTML = ""
        const img = document.createElement("img")
        img.src = resolve(src)
        if (current.attrs.alt) img.alt = current.attrs.alt
        if (current.attrs.title) img.title = current.attrs.title
        dom.appendChild(img)
      }

      const render = () => {
        const src = current.attrs.src
        if (!src) renderCard()
        else if (isWhiteboardEmbedPath(src)) renderWhiteboard(src)
        else renderImage(src)
      }

      render()

      return {
        dom,
        update(updated) {
          if (updated.type.name !== "image") return false
          current = updated
          render()
          return true
        },
        destroy() {
          whiteboardCleanup?.()
        },
      }
    }
  },
})
