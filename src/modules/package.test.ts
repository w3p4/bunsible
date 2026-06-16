import { test, expect } from "bun:test"
import { pkg } from "./package.ts"
import { makeMockSsh, makeCtx } from "./mock-ssh.ts"

test("package: already installed → not changed", async () => {
  const ssh = makeMockSsh({
    "dpkg-query": { code: 0, stdout: "install ok installed", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await pkg("nginx").run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(false)
})

test("package: missing → installs", async () => {
  const ssh = makeMockSsh({
    "dpkg-query": { code: 1, stdout: "", stderr: "" },
    "apt-get install": { code: 0, stdout: "installed nginx", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await pkg("nginx").run(ctx)
  expect(r.changed).toBe(true)
  expect(ssh.calls.some(c => c.cmd.includes("apt-get install"))).toBe(true)
})

test("package: absent, installed → removes", async () => {
  const ssh = makeMockSsh({
    "dpkg-query": { code: 0, stdout: "install ok installed", stderr: "" },
    "apt-get remove": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await pkg({ package: "nginx", state: "absent" }).run(ctx)
  expect(r.changed).toBe(true)
})

test("package: brew dispatch", async () => {
  const ssh = makeMockSsh({
    "brew list": { code: 1, stdout: "", stderr: "" },
    "brew install": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh, { kernel: "darwin", pkgMgr: "brew", initSystem: "launchd" })
  const r = await pkg("git").run(ctx)
  expect(r.changed).toBe(true)
  expect(ssh.calls.some(c => c.cmd.includes("brew install"))).toBe(true)
})

test("package: multiple names, some missing", async () => {
  let callIdx = 0
  const ssh = makeMockSsh()
  // First pkg installed, second not
  ssh.run = async (cmd: string) => {
    if (cmd.includes("dpkg-query")) {
      return callIdx++ === 0
        ? { code: 0, stdout: "install ok installed", stderr: "" }
        : { code: 1, stdout: "", stderr: "" }
    }
    return { code: 0, stdout: "", stderr: "" }
  }
  const ctx = makeCtx(ssh)
  const r = await pkg({ package: ["nginx", "git"] }).run(ctx)
  expect(r.changed).toBe(true)
})
