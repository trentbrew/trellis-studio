import { createResource, Show } from "solid-js"
import { codeToHtml } from "shiki"
import { useTheme } from "@opencode-ai/ui/theme/context"

export function JsonView(props: { code: string }) {
  const theme = useTheme()
  const [html] = createResource(
    () => ({ code: props.code, mode: theme.mode() }),
    async ({ code, mode }) =>
      codeToHtml(code, {
        lang: "json",
        theme: mode === "dark" ? "github-dark" : "github-light",
      }),
  )

  return (
    <Show when={html()} fallback={<pre class="db-json-view">{props.code}</pre>}>
      <div class="db-json-view shiki-json-view" innerHTML={html()!} />
    </Show>
  )
}
