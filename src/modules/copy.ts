import type { Ctx, Task, TaskResult } from "../types.ts"
import { resolve } from "node:path"

export type CopyOpts = {
  name?: string
  src: string
  dest: string
  mode?: string
  owner?: string
  group?: string
  ignoreErrors?: boolean
  when?: Task["when"]
  register?: string
}

export async function localSha256(path: string): Promise<string> {
  const data = await Bun.file(path).arrayBuffer()
  const buf = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function transferContent(
  ctx: Ctx,
  content: string | Uint8Array,
  localHash: string,
  dest: string,
  opts: { mode?: string; owner?: string; group?: string },
): Promise<TaskResult> {
  const q = JSON.stringify(dest)
  const remoteHash = await ctx.ssh.run(`sha256sum ${q} 2>/dev/null | awk '{print $1}'`)
  if (remoteHash.stdout.trim() === localHash) {
    // check attrs only
    return await checkAttrs(ctx, dest, opts)
  }

  if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }

  // ensure parent dir exists
  const parent = dest.replace(/\/[^/]+$/, "")
  if (parent && parent !== dest) {
    await ctx.ssh.run(`mkdir -p ${JSON.stringify(parent)}`)
  }

  await ctx.ssh.putContent(content, dest, { mode: opts.mode })
  if (opts.owner || opts.group) {
    const spec = [opts.owner ?? "", opts.group ? `:${opts.group}` : ""].join("")
    await ctx.ssh.run(`chown ${spec} ${q}`)
  }
  return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
}

async function checkAttrs(
  ctx: Ctx,
  dest: string,
  opts: { mode?: string; owner?: string; group?: string },
): Promise<TaskResult> {
  if (!opts.mode && !opts.owner && !opts.group) {
    return { ok: true, changed: false, failed: false, stdout: "", stderr: "" }
  }
  const stat = await ctx.ssh.run(`stat -c '%a %U %G' ${JSON.stringify(dest)} 2>/dev/null`)
  const [curMode, curUser, curGroup] = stat.stdout.trim().split(" ")
  let changed = false
  if (opts.mode && curMode !== opts.mode) {
    await ctx.ssh.run(`chmod ${opts.mode} ${JSON.stringify(dest)}`)
    changed = true
  }
  if (opts.owner && curUser !== opts.owner) {
    await ctx.ssh.run(`chown ${opts.owner} ${JSON.stringify(dest)}`)
    changed = true
  }
  if (opts.group && curGroup !== opts.group) {
    await ctx.ssh.run(`chgrp ${opts.group} ${JSON.stringify(dest)}`)
    changed = true
  }
  return { ok: true, changed, failed: false, stdout: "", stderr: "" }
}

export function copy(opts: CopyOpts): Task {
  const name = opts.name ?? `copy: ${opts.src} → ${opts.dest}`

  return {
    name,
    module: "copy",
    ignoreErrors: opts.ignoreErrors,
    when: opts.when,
    register: opts.register,
    run: async (ctx: Ctx): Promise<TaskResult> => {
      const absPath = resolve(opts.src)
      const file = Bun.file(absPath)
      if (!(await file.exists())) {
        return { ok: false, changed: false, failed: true, stdout: "", stderr: "", error: `src not found: ${opts.src}` }
      }

      const [localHash, content] = await Promise.all([
        localSha256(absPath),
        file.arrayBuffer().then(b => new Uint8Array(b)),
      ])

      return await transferContent(ctx, content, localHash, opts.dest, opts)
    },
  }
}
