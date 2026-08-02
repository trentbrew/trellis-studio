import { describe, expect, test } from "bun:test"
import { parseLsofListen } from "./lsof"

describe("parseLsofListen", () => {
  test("parses macOS-style LISTEN lines", () => {
    const stdout = `COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    12345 trent   21u  IPv4 0x1234567890abcdef      0t0  TCP *:3000 (LISTEN)
node    99999 trent   22u  IPv4 0xabcdef1234567890      0t0  TCP 127.0.0.1:5173 (LISTEN)
`
    const listeners = parseLsofListen(stdout)
    expect(listeners).toHaveLength(2)
    expect(listeners[0]).toMatchObject({ command: "node", pid: 12345, port: 3000 })
    expect(listeners[1]).toMatchObject({ port: 5173, address: "127.0.0.1" })
  })

  test("dedupes by port", () => {
    const stdout = `node    1 user   0u  IPv4 0x0      0t0  TCP *:4000 (LISTEN)
node    2 user   0u  IPv4 0x0      0t0  TCP *:4000 (LISTEN)
`
    expect(parseLsofListen(stdout)).toHaveLength(1)
  })
})
