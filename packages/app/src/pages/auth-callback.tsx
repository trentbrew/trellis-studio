import { onMount } from "solid-js"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { useAuth } from "@/context/auth"

export default function AuthCallback() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  onMount(async () => {
    const code = params.code
    if (!code) {
      navigate("/", { replace: true })
      return
    }

    await auth.handleCallback(code as string)
    navigate("/", { replace: true })
  })

  return (
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-14-regular text-text-weak">Signing in...</div>
    </div>
  )
}
