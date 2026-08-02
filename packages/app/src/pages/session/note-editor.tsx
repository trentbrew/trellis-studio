import { MarkdownEditor } from "@/pages/session/file-editor"

export function NoteEditor(props: {
  noteId: string
  value: string
  active: boolean
  onChange: (value: string) => void
}) {
  return (
    <div class="note-rich-editor">
      <MarkdownEditor
        path={`note:${props.noteId}`}
        value={props.value}
        active={props.active}
        onChange={props.onChange}
      />
    </div>
  )
}
