// Tenant context injected by the control plane when provisioning this Sprite.
// These env vars are set via `sprite exec` during sprite-init.

export const tenant = {
  id: import.meta.env.VITE_SPRITE_TENANT_ID as string | undefined,
  url: import.meta.env.VITE_SPRITE_URL as string | undefined,
  active: () => !!import.meta.env.VITE_SPRITE_TENANT_ID,
}
