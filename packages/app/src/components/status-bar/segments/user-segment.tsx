import { createMemo } from "solid-js"
import { useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { decode64 } from "@/utils/base64"
import { useAuthOptional } from "@/context/auth"
import { useServer } from "@/context/server"
import { usePlatform } from "@/context/platform"

export function UserSegment() {
  const params = useParams()
  const auth = useAuthOptional()
  const server = useServer()
  const platform = usePlatform()

  const name = createMemo(() => {
    // Derive from worktree path — extract username from /Users/<name>/... or /home/<name>/...
    const dir = decode64(params.dir ?? "") ?? ""
    const parts = dir.split("/").filter(Boolean)
    // macOS: Users/<name>, Linux: home/<name>
    const idx = parts.findIndex((p) => p === "Users" || p === "home")
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]
    // Windows: C:\Users\<name>
    const win = parts.findIndex((p) => p.toLowerCase() === "users")
    if (win >= 0 && parts[win + 1]) return parts[win + 1]
    // Fallback: auth email
    const email = auth?.user()?.email
    if (email) return email.split("@")[0]
    // Last resort: first dir segment
    return parts[0] ?? ""
  })

  return (
    <div class="flex items-center gap-1.5 px-1.5 py-0.5 shrink-0 min-w-0">
      <Icon name="user" size="small" class="shrink-0 text-text-weak" style={{ "font-size": "12px" }} />
      <span class="text-[11px] font-medium opacity-70 truncate max-w-[80px]">{name()}</span>
    </div>
  )
}
