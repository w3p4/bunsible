import { test, expect } from "bun:test"
import { shell } from "./shell.ts"
import { makeMockSsh, makeCtx } from "./mock-ssh.ts"

test("shell: runs command, reports changed", async () => {
  const ssh = makeMockSsh({ "echo hi": { code: 0, stdout: "hi\n", stderr: "" } })
  const ctx = makeCtx(ssh)
  const r = await shell("echo hi").run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(true)
  expect(r.stdout).toBe("hi\n")
})

test("shell: non-zero exit → failed", async () => {
  const ssh = makeMockSsh({ "false": { code: 1, stdout: "", stderr: "error" } })
  const ctx = makeCtx(ssh)
  const r = await shell("false").run(ctx)
  expect(r.failed).toBe(true)
  expect(r.ok).toBe(false)
})

test("shell: creates skips if file exists", async () => {
  const ssh = makeMockSsh({
    "test -e \"/tmp/foo\"": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await shell({ cmd: "touch /tmp/foo", creates: "/tmp/foo" }).run(ctx)
  expect(r.skipped).toBe(true)
  expect(r.changed).toBe(false)
  expect(ssh.calls).toHaveLength(1) // only the test -e call
})

test("shell: removes skips if file absent", async () => {
  const ssh = makeMockSsh({
    "test -e \"/tmp/bar\"": { code: 1, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await shell({ cmd: "rm /tmp/bar", removes: "/tmp/bar" }).run(ctx)
  expect(r.skipped).toBe(true)
})

test("shell: check skips if check exits 0", async () => {
  const ssh = makeMockSsh({
    "grep -q foo /etc/bar": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await shell({ cmd: "echo foo >> /etc/bar", check: "grep -q foo /etc/bar" }).run(ctx)
  expect(r.skipped).toBe(true)
})

test("shell: check-mode returns changed without running", async () => {
  const ssh = makeMockSsh()
  const ctx = makeCtx(ssh, {}, true) // checkMode=true
  const r = await shell("apt-get update").run(ctx)
  expect(r.changed).toBe(true)
  expect(ssh.calls).toHaveLength(0)
})
