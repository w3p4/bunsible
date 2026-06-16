import type { Ctx, Task, TaskResult } from "../types.ts"

export type ShellOpts = {
  name?: string
  cmd: string
  creates?: string
  removes?: string
  check?: string
  chdir?: string
  ignoreErrors?: boolean
  when?: Task["when"]
  register?: string
}

export function shell(arg: string | ShellOpts): Task {
  const opts: ShellOpts = typeof arg === "string" ? { cmd: arg } : arg
  const name = opts.name ?? `shell: ${opts.cmd.slice(0, 60)}`

  return {
    name,
    module: "shell",
    ignoreErrors: opts.ignoreErrors,
    when: opts.when,
    register: opts.register,
    run: async (ctx: Ctx): Promise<TaskResult> => {
      // idempotency pre-checks
      if (opts.creates) {
        const r = await ctx.ssh.run(`test -e ${JSON.stringify(opts.creates)}`)
        if (r.code === 0) {
          return { ok: true, changed: false, failed: false, skipped: true, stdout: "", stderr: "" }
        }
      }
      if (opts.removes) {
        const r = await ctx.ssh.run(`test -e ${JSON.stringify(opts.removes)}`)
        if (r.code !== 0) {
          return { ok: true, changed: false, failed: false, skipped: true, stdout: "", stderr: "" }
        }
      }
      if (opts.check) {
        const r = await ctx.ssh.run(opts.check)
        if (r.code === 0) {
          return { ok: true, changed: false, failed: false, skipped: true, stdout: r.stdout, stderr: r.stderr }
        }
      }

      if (ctx.checkMode) {
        return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      }

      const cmd = opts.chdir ? `cd ${JSON.stringify(opts.chdir)} && ${opts.cmd}` : opts.cmd
      const r = await ctx.ssh.run(cmd)

      if (r.code !== 0) {
        return {
          ok: false, changed: false, failed: true,
          stdout: r.stdout, stderr: r.stderr,
          error: `exit code ${r.code}`,
        }
      }
      return { ok: true, changed: true, failed: false, stdout: r.stdout, stderr: r.stderr }
    },
  }
}
