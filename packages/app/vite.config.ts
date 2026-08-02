import { defineConfig } from "vite"
import desktopPlugin from "./vite"

export default defineConfig({
  plugins: [desktopPlugin] as any,
  optimizeDeps: {
    include: ["@excalidraw/excalidraw", "react", "react-dom", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
  },
  build: {
    target: "esnext",
    // sourcemap: true,
  },
})
