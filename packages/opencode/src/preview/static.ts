import path from "path"
import { existsSync, readdirSync } from "fs"
import { assign } from "./port"
import { Log } from "../util/log"

const log = Log.create({ service: "preview.static" })

const RELOAD_SCRIPT = `
<script>
(function(){
  var ws = new WebSocket("ws://" + location.host + "/__reload");
  ws.onmessage = function(){ location.reload(); };
  ws.onclose = function(){ setTimeout(function(){ location.reload(); }, 1000); };
})();
</script>`

export function html(dir: string): string | undefined {
  for (const name of ["index.html", "index.htm"]) {
    if (existsSync(path.join(dir, name))) return name
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => item.name)
    .filter((name) => name.endsWith(".html") || name.endsWith(".htm"))
    .sort()[0]
}

function entrypoint(dir: string, port: number): string {
  const file = html(dir)
  return `
const fs = require("fs");
const path = require("path");

const RELOAD_SCRIPT = ${JSON.stringify(RELOAD_SCRIPT)};
const DIR = ${JSON.stringify(dir)};
const FILE = ${JSON.stringify(file)};
const PORT = ${port};
const clients = new Set();

const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function type(p) {
  return mime[path.extname(p).toLowerCase()] || "application/octet-stream";
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/__reload") {
      if (server.upgrade(req)) return;
      return new Response("upgrade failed", { status: 400 });
    }

    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = FILE ? "/" + FILE : "/index.html";
    const file = path.join(DIR, rel);

    if (!fs.existsSync(file)) {
      const home = FILE ? path.join(DIR, FILE) : "";
      const index = path.join(DIR, "index.html");
      if (FILE && fs.existsSync(home)) {
        rel = "/" + FILE;
      } else if (fs.existsSync(index)) {
        rel = "/index.html";
      } else {
        return new Response("Not found", { status: 404 });
      }
    }

    const resolved = path.join(DIR, rel);
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const idx = path.join(resolved, "index.html");
      if (!fs.existsSync(idx)) return new Response("Not found", { status: 404 });
      const html = fs.readFileSync(idx, "utf-8");
      return new Response(html.replace("</body>", RELOAD_SCRIPT + "</body>"), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    const ct = type(resolved);
    if (ct === "text/html") {
      const html = fs.readFileSync(resolved, "utf-8");
      return new Response(html.replace("</body>", RELOAD_SCRIPT + "</body>"), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    return new Response(Bun.file(resolved), {
      headers: { "Content-Type": ct, "Cache-Control": "no-cache" },
    });
  },
  websocket: {
    open(ws) { clients.add(ws); },
    close(ws) { clients.delete(ws); },
    message() {},
  },
});

function reload() {
  for (const ws of clients) {
    try { ws.send("reload"); } catch {}
  }
}

fs.watch(DIR, { recursive: true }, (event, filename) => {
  if (!filename) return;
  const ext = path.extname(filename).toLowerCase();
  if ([".html", ".css", ".js", ".json", ".svg"].includes(ext)) {
    reload();
  }
});

console.log("Static server listening on http://localhost:" + PORT);
`
}

export async function scaffold(
  dir: string,
  name: string,
  port?: number,
): Promise<{ port: number; command: string; script: string }> {
  const next = await assign({ directory: dir, name, preferred: port })
  const trellis = path.join(dir, ".trellis")
  if (!existsSync(trellis)) await Bun.write(path.join(trellis, ".gitkeep"), "")
  const script = path.join(trellis, "_serve.js")
  await Bun.write(script, entrypoint(dir, next))
  log.info("scaffolded static server", { dir, port: next, script })
  return { port: next, command: "bun .trellis/_serve.js", script }
}

export function hasHtml(dir: string): boolean {
  return Boolean(html(dir))
}
