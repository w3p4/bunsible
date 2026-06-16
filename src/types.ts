export type Host = {
  alias: string
  host: string
  user?: string
  port?: number
  key?: string
}

export type HostFacts = {
  kernel: "linux" | "darwin" | string
  distro?: string
  pkgMgr: "apt" | "dnf" | "yum" | "apk" | "brew" | "unknown"
  initSystem: "systemd" | "launchd" | "openrc" | "unknown"
}

export type Ctx = {
  host: Host
  facts: HostFacts
  ssh: {
    run(cmd: string, opts?: { stdin?: string }): Promise<{ code: number; stdout: string; stderr: string }>
    putFile(local: string, remote: string, opts?: { mode?: string }): Promise<void>
    putContent(content: string | Uint8Array, remote: string, opts?: { mode?: string }): Promise<void>
  }
  vars: Record<string, unknown>
  checkMode: boolean
  verbose: boolean
  log: (line: string) => void
}

export type TaskResult = {
  ok: boolean
  changed: boolean
  failed: boolean
  skipped?: boolean
  stdout: string
  stderr: string
  data?: Record<string, unknown>
  error?: string
}

export type Task = {
  name: string
  module: string
  ignoreErrors?: boolean
  when?: (ctx: Ctx) => boolean | Promise<boolean>
  register?: string
  run: (ctx: Ctx) => Promise<TaskResult>
}

export type PlayDef = {
  name?: string
  hosts: (string | Host)[]
  vars?: Record<string, unknown>
  tasks: Task[]
}

export type HostReport = {
  host: Host
  results: TaskResult[]
  connected: boolean
  error?: string
}

export type PlayReport = {
  hosts: HostReport[]
  ok: boolean
}
