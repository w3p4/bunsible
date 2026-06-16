import type { PlayDef, Task, TaskResult, Ctx, HostReport, PlayReport } from "./types.ts"
import { parseHost } from "./inventory.ts"
import { SshSession } from "./ssh.ts"
import { detectFacts } from "./facts.ts"
import { taskLine, playRecap } from "./reporter.ts"

export type RunOpts = {
  limit?: string[]
  checkMode?: boolean
  verbose?: boolean
}

export async function runPlay(def: PlayDef, opts: RunOpts = {}): Promise<PlayReport> {
  let hosts = def.hosts.map(parseHost)

  if (opts.limit?.length) {
    const allowed = new Set(opts.limit)
    hosts = hosts.filter(h => allowed.has(h.alias) || allowed.has(h.host))
  }

  if (def.name) {
    process.stdout.write(`\nPLAY [${def.name}] ${"*".repeat(Math.max(0, 62 - def.name.length))}\n\n`)
  }

  const reports = await Promise.all(hosts.map(h => runHost(h, def, opts)))
  playRecap(reports)
  return { hosts: reports, ok: reports.every(r => r.connected && !r.results.some(t => t.failed)) }
}

async function runHost(
  rawHost: ReturnType<typeof parseHost>,
  def: PlayDef,
  opts: RunOpts,
): Promise<HostReport> {
  const host = rawHost
  const ssh = new SshSession(host)

  try {
    await ssh.connect()
  } catch (e) {
    return { host, results: [], connected: false, error: String(e) }
  }

  let facts: Ctx["facts"]
  try {
    facts = await detectFacts(ssh)
  } catch (e) {
    await ssh.close().catch(() => {})
    return { host, results: [], connected: false, error: `facts detection failed: ${String(e)}` }
  }

  const vars: Record<string, unknown> = { ...(def.vars ?? {}) }
  const results: TaskResult[] = []

  const ctx: Ctx = {
    host,
    facts,
    ssh,
    vars,
    checkMode: opts.checkMode ?? false,
    verbose: opts.verbose ?? false,
    log: (line) => process.stdout.write(`[${host.alias}] ${line}\n`),
  }

  try {
    for (const t of def.tasks) {
      const result = await runTask(t, ctx, opts.verbose ?? false)
      results.push(result)
      if (t.register) vars[t.register] = result
      if (result.failed && !t.ignoreErrors) break
    }
  } finally {
    await ssh.close().catch(() => {})
  }

  return { host, results, connected: true }
}

async function runTask(t: Task, ctx: Ctx, verbose: boolean): Promise<TaskResult> {
  if (t.when) {
    let cond: boolean
    try {
      cond = await t.when(ctx)
    } catch (e) {
      const r: TaskResult = { ok: false, changed: false, failed: true, stdout: "", stderr: "", error: `when() threw: ${String(e)}` }
      taskLine(ctx.host, t, r, verbose)
      return r
    }
    if (!cond) {
      const r: TaskResult = { ok: true, changed: false, failed: false, skipped: true, stdout: "", stderr: "" }
      taskLine(ctx.host, t, r, verbose)
      return r
    }
  }

  let r: TaskResult
  try {
    r = await t.run(ctx)
  } catch (e) {
    r = { ok: false, changed: false, failed: true, stdout: "", stderr: "", error: String(e) }
  }

  taskLine(ctx.host, t, r, verbose)
  return r
}
