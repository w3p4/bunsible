import type { Ctx, Task, TaskResult } from "../types.ts"
import { resolve } from "node:path"
import { transferContent } from "./copy.ts"

export type TemplateOpts = {
  name?: string
  src: string          // .ts file exporting render(vars: T): string
  dest: string
  vars?: Record<string, unknown>
  mode?: string
  owner?: string
  group?: string
  ignoreErrors?: boolean
  when?: Task["when"]
  register?: string
}

export function template(opts: TemplateOpts): Task {
  const name = opts.name ?? `template: ${opts.src} → ${opts.dest}`

  return {
    name,
    module: "template",
    ignoreErrors: opts.ignoreErrors,
    when: opts.when,
    register: opts.register,
    run: async (ctx: Ctx): Promise<TaskResult> => {
      const absPath = resolve(opts.src)
      if (!(await Bun.file(absPath).exists())) {
        return { ok: false, changed: false, failed: true, stdout: "", stderr: "", error: `template src not found: ${opts.src}` }
      }

      // dynamic import — src must export render(vars): string
      const mod = await import(absPath) as { render?: (v: Record<string, unknown>) => string; default?: (v: Record<string, unknown>) => string }
      const renderFn = mod.render ?? mod.default
      if (typeof renderFn !== "function") {
        return { ok: false, changed: false, failed: true, stdout: "", stderr: "", error: `${opts.src} must export render(vars): string` }
      }

      let rendered: string
      try {
        rendered = renderFn({ ...ctx.vars, ...(opts.vars ?? {}) })
      } catch (e) {
        return { ok: false, changed: false, failed: true, stdout: "", stderr: "", error: `template render error: ${String(e)}` }
      }

      const encoder = new TextEncoder()
      const content = encoder.encode(rendered)
      const hashBuf = await crypto.subtle.digest("SHA-256", content)
      const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("")

      return await transferContent(ctx, content, hash, opts.dest, opts)
    },
  }
}
