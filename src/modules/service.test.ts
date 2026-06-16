import { test, expect } from "bun:test"
import { service } from "./service.ts"
import { makeMockSsh, makeCtx } from "./mock-ssh.ts"

test("service: systemd, already active → not changed", async () => {
  const ssh = makeMockSsh({
    "systemctl is-active": { code: 0, stdout: "active", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await service({ service: "nginx", state: "started" }).run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(false)
})

test("service: systemd, inactive → starts", async () => {
  const ssh = makeMockSsh({
    "systemctl is-active": { code: 1, stdout: "inactive", stderr: "" },
    "systemctl start": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await service({ service: "nginx", state: "started" }).run(ctx)
  expect(r.changed).toBe(true)
  expect(ssh.calls.some(c => c.cmd.includes("systemctl start"))).toBe(true)
})

test("service: systemd, restarted always restarts", async () => {
  const ssh = makeMockSsh({
    "systemctl restart": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await service({ service: "nginx", state: "restarted" }).run(ctx)
  expect(r.changed).toBe(true)
})

test("service: systemd, enabled=true when disabled", async () => {
  const ssh = makeMockSsh({
    "systemctl is-active": { code: 0, stdout: "active", stderr: "" },
    "systemctl is-enabled": { code: 1, stdout: "disabled", stderr: "" },
    "systemctl enable": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await service({ service: "nginx", state: "started", enabled: true }).run(ctx)
  expect(r.changed).toBe(true)
  expect(ssh.calls.some(c => c.cmd.includes("systemctl enable"))).toBe(true)
})

test("service: unsupported initSystem → fails", async () => {
  const ssh = makeMockSsh()
  const ctx = makeCtx(ssh, { initSystem: "unknown" })
  const r = await service({ service: "foo", state: "started" }).run(ctx)
  expect(r.failed).toBe(true)
})

test("service: launchd, not running → starts", async () => {
  const ssh = makeMockSsh({
    "launchctl list": { code: 1, stdout: "", stderr: "" },
    "launchctl start": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh, { kernel: "darwin", pkgMgr: "brew", initSystem: "launchd" })
  const r = await service({ service: "com.example.foo", state: "started" }).run(ctx)
  expect(r.changed).toBe(true)
})
