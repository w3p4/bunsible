import type { Host } from "./types.ts"
import { homedir } from "node:os"
import { mkdirSync } from "node:fs"

export class SshSession {
  readonly host: Host
  private sock: string
  private hostspec: string
  private baseArgs: string[]
  private connected = false

  constructor(host: Host) {
    this.host = host
    const cmDir = `${homedir()}/.bunsible/cm`
    mkdirSync(cmDir, { recursive: true })
    this.sock = `${cmDir}/${host.alias.replace(/[^a-zA-Z0-9._-]/g, "_")}-${process.pid}.sock`
    this.hostspec = host.user ? `${host.user}@${host.host}` : host.host
    this.baseArgs = [
      ...(host.key ? ["-i", host.key] : []),
      ...(host.port ? ["-p", String(host.port)] : []),
    ]
  }

  async connect(): Promise<void> {
    const master = Bun.spawn(
      [
        "ssh",
        "-M", "-S", this.sock,
        "-o", "ControlPersist=60s",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-fnNT",
        ...this.baseArgs,
        this.hostspec,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    await master.exited
    if (master.exitCode !== 0) {
      const err = await new Response(master.stderr).text()
      throw new Error(`ssh connect failed (${this.host.alias}): ${err.trim()}`)
    }
    // verify socket works
    const check = await this.run("true")
    if (check.code !== 0) {
      throw new Error(`ssh verify failed (${this.host.alias}): ${check.stderr}`)
    }
    this.connected = true
  }

  async run(cmd: string, opts: { stdin?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(
      ["ssh", "-S", this.sock, "-o", "BatchMode=yes", ...this.baseArgs, this.hostspec, "--", cmd],
      {
        stdin: opts.stdin !== undefined ? "pipe" : "inherit",
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    if (opts.stdin !== undefined) {
      const writer = proc.stdin!
      writer.write(opts.stdin)
      await writer.end()
    }
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const code = await proc.exited
    return { code, stdout, stderr }
  }

  async putFile(local: string, remote: string, opts: { mode?: string } = {}): Promise<void> {
    const scpArgs = [
      "scp",
      "-o", `ControlPath=${this.sock}`,
      ...(this.host.port ? ["-P", String(this.host.port)] : []),
      local,
      `${this.hostspec}:${remote}`,
    ]
    const proc = Bun.spawn(scpArgs, { stdout: "pipe", stderr: "pipe" })
    const [, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const code = await proc.exited
    if (code !== 0) throw new Error(`scp failed: ${stderr.trim()}`)

    if (opts.mode) {
      const r = await this.run(`chmod ${opts.mode} ${JSON.stringify(remote)}`)
      if (r.code !== 0) throw new Error(`chmod failed: ${r.stderr}`)
    }
  }

  async putContent(content: string | Uint8Array, remote: string, opts: { mode?: string } = {}): Promise<void> {
    const tmp = `${remote}.bunsible.tmp`
    const payload = typeof content === "string" ? content : new TextDecoder().decode(content)
    const modeCmd = opts.mode ? ` && chmod ${opts.mode} ${JSON.stringify(remote)}` : ""
    const cmd = `cat > ${JSON.stringify(tmp)} && mv ${JSON.stringify(tmp)} ${JSON.stringify(remote)}${modeCmd}`
    const r = await this.run(cmd, { stdin: payload })
    if (r.code !== 0) throw new Error(`putContent failed: ${r.stderr}`)
  }

  async close(): Promise<void> {
    if (!this.connected) return
    const proc = Bun.spawn(
      ["ssh", "-S", this.sock, "-O", "exit", this.hostspec],
      { stdout: "pipe", stderr: "pipe" },
    )
    await proc.exited
    this.connected = false
  }
}
