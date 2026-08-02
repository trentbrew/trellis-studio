import "solid-js"

interface ImportMetaEnv {
  readonly VITE_OPENCODE_SERVER_HOST: string
  readonly VITE_OPENCODE_SERVER_PORT: string
  readonly VITE_SPRITE_TENANT_ID?: string
  readonly VITE_SPRITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "x-data-spreadsheet/dist/xspreadsheet.js"

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      sortable: true
    }
  }
}
