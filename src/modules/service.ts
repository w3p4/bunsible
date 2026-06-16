import type { Ctx, Task, TaskResult } from "../types.ts"

type ServiceState = "started" | "stopped" | "restarted" | "reloaded"

export type ServiceOpts = {
  name?: string
  service: string
  state?: ServiceState
  enabled?: boolean
  ignoreErrors?: boolean
  when?: Task["when"]
  register?: string
}

export function service(opts: ServiceOpts): Task {
  const name = opts.name ?? `service: ${opts.service} (${opts.state ?? "started"})`

  return {
    name,
    module: "service",
    ignoreErrors: opts.ignoreErrors,
    when: opts.when,
    register: opts.register,
    run: async (ctx: Ctx): Promise<TaskResult> => {
      const svc = opts.service
      const state: ServiceState = opts.state ?? "started"
      const { initSystem } = ctx.facts

      if (initSystem === "systemd") return runSystemd(ctx, svc, state, opts.enabled)
      if (initSystem === "launchd") return runLaunchd(ctx, svc, state, opts.enabled)
      if (initSystem === "openrc") return runOpenrc(ctx, svc, state, opts.enabled)

      return { ok: false, changed: false, failed: true, stdout: "", stderr: "", error: `unsupported initSystem: ${initSystem}` }
    },
  }
}

async function runSystemd(ctx: Ctx, svc: string, state: ServiceState, enabled?: boolean): Promise<TaskResult> {
  const q = JSON.stringify(svc)
  let changed = false

  if (state === "restarted") {
    if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
    const r = await ctx.ssh.run(`systemctl restart ${q}`)
    if (r.code !== 0) return fail(r.stderr)
    changed = true
  } else if (state === "reloaded") {
    if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
    const r = await ctx.ssh.run(`systemctl reload ${q}`)
    if (r.code !== 0) return fail(r.stderr)
    changed = true
  } else if (state === "started") {
    const active = await ctx.ssh.run(`systemctl is-active ${q}`)
    if (active.stdout.trim() !== "active") {
      if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      const r = await ctx.ssh.run(`systemctl start ${q}`)
      if (r.code !== 0) return fail(r.stderr)
      changed = true
    }
  } else if (state === "stopped") {
    const active = await ctx.ssh.run(`systemctl is-active ${q}`)
    if (active.stdout.trim() === "active") {
      if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      const r = await ctx.ssh.run(`systemctl stop ${q}`)
      if (r.code !== 0) return fail(r.stderr)
      changed = true
    }
  }

  if (enabled !== undefined) {
    const isEnabled = await ctx.ssh.run(`systemctl is-enabled ${q}`)
    const currently = isEnabled.stdout.trim() === "enabled"
    if (currently !== enabled) {
      if (!ctx.checkMode) {
        const r = await ctx.ssh.run(`systemctl ${enabled ? "enable" : "disable"} ${q}`)
        if (r.code !== 0) return fail(r.stderr)
      }
      changed = true
    }
  }

  return { ok: true, changed, failed: false, stdout: "", stderr: "" }
}

async function runLaunchd(ctx: Ctx, svc: string, state: ServiceState, enabled?: boolean): Promise<TaskResult> {
  const q = JSON.stringify(svc)
  let changed = false

  const listed = await ctx.ssh.run(`launchctl list | grep -q ${q}`)
  const isRunning = listed.code === 0

  if (state === "started" || state === "restarted" || state === "reloaded") {
    if (state === "restarted" && isRunning) {
      if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      await ctx.ssh.run(`launchctl stop ${q}`)
      const r = await ctx.ssh.run(`launchctl start ${q}`)
      if (r.code !== 0) return fail(r.stderr)
      changed = true
    } else if (!isRunning) {
      if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      const r = await ctx.ssh.run(`launchctl start ${q}`)
      if (r.code !== 0) return fail(r.stderr)
      changed = true
    }
  } else if (state === "stopped" && isRunning) {
    if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
    const r = await ctx.ssh.run(`launchctl stop ${q}`)
    if (r.code !== 0) return fail(r.stderr)
    changed = true
  }

  if (enabled !== undefined) {
    // launchd enable/disable is load/unload
    const cmd = enabled ? `launchctl load -w ${q}` : `launchctl unload -w ${q}`
    if (!ctx.checkMode) {
      await ctx.ssh.run(cmd)
    }
    changed = true
  }

  return { ok: true, changed, failed: false, stdout: "", stderr: "" }
}

async function runOpenrc(ctx: Ctx, svc: string, state: ServiceState, enabled?: boolean): Promise<TaskResult> {
  const q = JSON.stringify(svc)
  let changed = false

  if (state === "started") {
    const r = await ctx.ssh.run(`rc-service ${q} status`)
    if (r.code !== 0) {
      if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      const start = await ctx.ssh.run(`rc-service ${q} start`)
      if (start.code !== 0) return fail(start.stderr)
      changed = true
    }
  } else if (state === "stopped") {
    const r = await ctx.ssh.run(`rc-service ${q} status`)
    if (r.code === 0) {
      if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      const stop = await ctx.ssh.run(`rc-service ${q} stop`)
      if (stop.code !== 0) return fail(stop.stderr)
      changed = true
    }
  } else if (state === "restarted" || state === "reloaded") {
    if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
    const cmd = state === "reloaded" ? "reload" : "restart"
    const r = await ctx.ssh.run(`rc-service ${q} ${cmd}`)
    if (r.code !== 0) return fail(r.stderr)
    changed = true
  }

  if (enabled !== undefined) {
    if (!ctx.checkMode) {
      const r = await ctx.ssh.run(`rc-update ${enabled ? "add" : "del"} ${q}`)
      if (r.code !== 0 && !r.stderr.includes("already")) return fail(r.stderr)
    }
    changed = true
  }

  return { ok: true, changed, failed: false, stdout: "", stderr: "" }
}

function fail(msg: string): TaskResult {
  return { ok: false, changed: false, failed: true, stdout: "", stderr: msg, error: msg }
}
