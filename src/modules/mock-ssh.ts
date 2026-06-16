import type { Ctx, HostFacts } from "../types.ts"

export type SshCall = {
  cmd: string
  stdin?: string
}

export type MockResponse = {
  code: number
  stdout: string
  stderr: string
}

export type MockSsh = Ctx["ssh"] & {
  calls: SshCall[]
  uploads: Array<{ remote: string; content: string; mode?: string }>
}

export function makeMockSsh(responses: Record<string, MockResponse> = {}): MockSsh {
  const calls: SshCall[] = []
  const uploads: Array<{ remote: string; content: string; mode?: string }> = []
  const defaultOk: MockResponse = { code: 0, stdout: "", stderr: "" }

  function matchResponse(cmd: string): MockResponse {
    // exact match first, then substring
    if (cmd in responses) return responses[cmd]!
    for (const [key, val] of Object.entries(responses)) {
      if (cmd.includes(key)) return val
    }
    return defaultOk
  }

  return {
    calls,
    uploads,
    async run(cmd, opts) {
      calls.push({ cmd, stdin: opts?.stdin })
      return matchResponse(cmd)
    },
    async putFile(local, remote, opts) {
      uploads.push({ remote, content: `FILE:${local}`, mode: opts?.mode })
    },
    async putContent(content, remote, opts) {
      uploads.push({ remote, content: typeof content === "string" ? content : new TextDecoder().decode(content), mode: opts?.mode })
    },
  }
}

export function makeCtx(ssh: MockSsh, facts: Partial<HostFacts> = {}, checkMode = false): Ctx {
  return {
    host: { alias: "test", host: "test" },
    facts: {
      kernel: "linux",
      distro: "ubuntu",
      pkgMgr: "apt",
      initSystem: "systemd",
      ...facts,
    },
    ssh,
    vars: {},
    checkMode,
    verbose: false,
    log: () => {},
  }
}
