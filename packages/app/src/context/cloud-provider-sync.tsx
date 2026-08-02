import { createEffect } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { createCloudAuth } from "@/context/cloud-auth"
import { cloudBrokerUrl, isCloudMode } from "@/lib/cloud-mode"
import { TRELLIS_CLOUD_PROVIDER_ID } from "@/lib/opencode-zen-model"

let lastSyncKey = ""

async function syncCloudProvider(
  globalSDK: ReturnType<typeof useGlobalSDK>,
  token: string,
  brokerUrl: string,
) {
  const baseURL = `${brokerUrl.replace(/\/+$/, "")}/ai/v1`

  await globalSDK.client.auth.set({
    providerID: TRELLIS_CLOUD_PROVIDER_ID,
    auth: { type: "api", key: token },
  })

  await globalSDK.client.global.config.update({
    config: {
      provider: {
        [TRELLIS_CLOUD_PROVIDER_ID]: {
          options: { baseURL },
        },
      },
    },
  })

  await globalSDK.client.global.dispose()
}

/**
 * When the IDE runs inside the cloud dashboard iframe, push the InstantDB
 * bearer token to opencode as the trellis-cloud provider key so sandbox
 * LLM calls route through the broker's metered ai-proxy.
 */
export function CloudProviderSync() {
  const globalSDK = useGlobalSDK()
  const cloudAuth = createCloudAuth()

  createEffect(() => {
    const token = cloudAuth.token()
    const brokerUrl = cloudBrokerUrl()
    if (!isCloudMode() || !token || !brokerUrl) return

    const syncKey = `${token}:${brokerUrl}`
    if (syncKey === lastSyncKey) return
    lastSyncKey = syncKey

    void syncCloudProvider(globalSDK, token, brokerUrl).catch((err) => {
      console.warn("[cloud-provider-sync] failed to sync trellis-cloud auth:", err)
      lastSyncKey = ""
    })
  })

  return null
}
