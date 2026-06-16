import type { Ctx, Task, TaskResult } from "../types.ts"

type FileState = "directory" | "absent" | "touch" | "link"

export type FileOpts = {
  name?: string
  path: string
  state: FileState
  mode?: string
  owner?: string
  group?: string
  src?: string // for state: "link"
  ignoreErrors?: boolean
  when?: Task["when"]
  register?: string
}

export function file(opts: FileOpts): Task {
  const name = opts.name ?? `file: ${opts.path} (${opts.state})`

  return {
    name,
    module: "file",
    ignoreErrors: opts.ignoreErrors,
    when: opts.when,
    register: opts.register,
    run: async (ctx: Ctx): Promise<TaskResult> => {
      const path = JSON.stringify(opts.path)

      if (opts.state === "absent") {
        const exists = await ctx.ssh.run(`test -e ${path}`)
        if (exists.code !== 0) {
          return { ok: true, changed: false, failed: false, stdout: "", stderr: "" }
        }
        if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
        const r = await ctx.ssh.run(`rm -rf ${path}`)
        if (r.code !== 0) return fail(r.stderr)
        return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      }

      if (opts.state === "directory") {
        const stat = await ctx.ssh.run(`stat -c '%F %a %U %G' ${path} 2>/dev/null || echo MISSING`)
        const current = stat.stdout.trim()
        if (current !== "MISSING") {
          const [ftype] = current.split(" ")
          if (ftype !== "directory") return fail(`${opts.path} exists but is not a directory`)
          // already dir — check mode/owner
          const changes = await applyAttrs(ctx, opts, path, current, opts.state)
          return changes
        }
        if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
        const r = await ctx.ssh.run(`mkdir -p ${path}`)
        if (r.code !== 0) return fail(r.stderr)
        await applyAttrs(ctx, opts, path, "MISSING", opts.state)
        return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      }

      if (opts.state === "touch") {
        if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
        const r = await ctx.ssh.run(`touch ${path}`)
        if (r.code !== 0) return fail(r.stderr)
        await applyAttrs(ctx, opts, path, "MISSING", opts.state)
        return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      }

      if (opts.state === "link") {
        if (!opts.src) return fail("file state=link requires src")
        const src = JSON.stringify(opts.src)
        const current = await ctx.ssh.run(`readlink ${path} 2>/dev/null || echo MISSING`)
        if (current.stdout.trim() === opts.src) {
          return { ok: true, changed: false, failed: false, stdout: "", stderr: "" }
        }
        if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
        const r = await ctx.ssh.run(`ln -sf ${src} ${path}`)
        if (r.code !== 0) return fail(r.stderr)
        return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      }

      return fail(`unknown state: ${opts.state as string}`)
    },
  }
}

async function applyAttrs(
  ctx: Ctx,
  opts: FileOpts,
  path: string,
  current: string,
  _state: FileState,
): Promise<TaskResult> {
  const parts = current === "MISSING" ? [] : current.split(" ")
  const [, curMode, curUser, curGroup] = parts

  let changed = false
  const errs: string[] = []

  if (opts.mode && curMode !== opts.mode) {
    const r = await ctx.ssh.run(`chmod ${opts.mode} ${path}`)
    if (r.code !== 0) errs.push(r.stderr)
    else changed = true
  }
  if (opts.owner && curUser !== opts.owner) {
    const r = await ctx.ssh.run(`chown ${opts.owner} ${path}`)
    if (r.code !== 0) errs.push(r.stderr)
    else changed = true
  }
  if (opts.group && curGroup !== opts.group) {
    const r = await ctx.ssh.run(`chgrp ${opts.group} ${path}`)
    if (r.code !== 0) errs.push(r.stderr)
    else changed = true
  }

  if (errs.length) return fail(errs.join("; "))
  return { ok: true, changed, failed: false, stdout: "", stderr: "" }
}

function fail(msg: string): TaskResult {
  return { ok: false, changed: false, failed: true, stdout: "", stderr: msg, error: msg }
}
