import { test, expect } from "bun:test"
import { template } from "./template.ts"
import { makeMockSsh, makeCtx } from "./mock-ssh.ts"
import { resolve } from "node:path"

const GREETING_TPL = resolve("./examples/templates/greeting.ts")

test("template: renders and uploads when dest differs", async () => {
  const ssh = makeMockSsh({
    // sha256sum returns different hash → upload required
    "sha256sum": { code: 0, stdout: "0000000000000000000000000000000000000000000000000000000000000000\n", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await template({ src: GREETING_TPL, dest: "/tmp/greeting.txt", vars: { name: "bunsible" } }).run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(true)
  expect(ssh.uploads.some(u => u.remote === "/tmp/greeting.txt")).toBe(true)
  expect(ssh.uploads[0]!.content).toContain("Hello, bunsible!")
})

test("template: skips upload when hash matches", async () => {
  // get the real sha256 of rendered content
  const { render } = await import(GREETING_TPL) as { render: (v: Record<string, unknown>) => string }
  const rendered = render({ name: "world" })
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rendered))
  const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")

  const ssh = makeMockSsh({
    "sha256sum": { code: 0, stdout: `${hash}\n`, stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await template({ src: GREETING_TPL, dest: "/tmp/greeting.txt", vars: { name: "world" } }).run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(false)
  expect(ssh.uploads).toHaveLength(0)
})

test("template: missing src → fails", async () => {
  const ssh = makeMockSsh()
  const ctx = makeCtx(ssh)
  const r = await template({ src: "./nonexistent.ts", dest: "/tmp/x" }).run(ctx)
  expect(r.failed).toBe(true)
})
