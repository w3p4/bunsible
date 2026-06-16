import type { Host } from "./types.ts"

// "user@host:port" | "host" | Host object
export function parseHost(input: string | Host): Host {
  if (typeof input !== "string") {
    return { ...input, alias: input.alias ?? input.host }
  }

  let rest = input
  let user: string | undefined
  let port: number | undefined

  // strip user@
  const atIdx = rest.indexOf("@")
  if (atIdx !== -1) {
    user = rest.slice(0, atIdx)
    rest = rest.slice(atIdx + 1)
  }

  // strip :port
  const colonIdx = rest.lastIndexOf(":")
  if (colonIdx !== -1) {
    const maybePort = rest.slice(colonIdx + 1)
    if (/^\d+$/.test(maybePort)) {
      port = parseInt(maybePort, 10)
      rest = rest.slice(0, colonIdx)
    }
  }

  const host = rest
  return { alias: input, host, user, port }
}
