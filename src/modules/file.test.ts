import { test, expect } from "bun:test"
import { file } from "./file.ts"
import { makeMockSsh, makeCtx } from "./mock-ssh.ts"

test("file: directory already exists → not changed", async () => {
  const ssh = makeMockSsh({
    "stat -c": { code: 0, stdout: "directory 755 user group", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await file({ path: "/tmp/dir", state: "directory" }).run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(false)
})

test("file: directory MISSING → creates it", async () => {
  const ssh = makeMockSsh({
    "stat -c": { code: 0, stdout: "MISSING", stderr: "" },
    "mkdir -p": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await file({ path: "/tmp/newdir", state: "directory" }).run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(true)
  expect(ssh.calls.some(c => c.cmd.includes("mkdir -p"))).toBe(true)
})

test("file: absent, already gone → not changed", async () => {
  const ssh = makeMockSsh({
    "test -e": { code: 1, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await file({ path: "/tmp/gone", state: "absent" }).run(ctx)
  expect(r.ok).toBe(true)
  expect(r.changed).toBe(false)
})

test("file: absent, exists → removes it", async () => {
  const ssh = makeMockSsh({
    "test -e": { code: 0, stdout: "", stderr: "" },
    "rm -rf": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await file({ path: "/tmp/old", state: "absent" }).run(ctx)
  expect(r.changed).toBe(true)
  expect(ssh.calls.some(c => c.cmd.includes("rm -rf"))).toBe(true)
})

test("file: link creates symlink", async () => {
  const ssh = makeMockSsh({
    "readlink": { code: 1, stdout: "MISSING", stderr: "" },
    "ln -sf": { code: 0, stdout: "", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await file({ path: "/tmp/link", state: "link", src: "/tmp/target" }).run(ctx)
  expect(r.changed).toBe(true)
})

test("file: link already correct → not changed", async () => {
  const ssh = makeMockSsh({
    "readlink": { code: 0, stdout: "/tmp/target", stderr: "" },
  })
  const ctx = makeCtx(ssh)
  const r = await file({ path: "/tmp/link", state: "link", src: "/tmp/target" }).run(ctx)
  expect(r.changed).toBe(false)
})
