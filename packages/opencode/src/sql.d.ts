declare module "*.sql" {
  const content: string
  export default content
}

declare module "sql.js/dist/sql-wasm.wasm" {
  const path: string
  export default path
}
