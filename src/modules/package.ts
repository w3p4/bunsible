import type { Ctx, Task, TaskResult } from "../types.ts"

type PackageState = "present" | "absent" | "latest"

export type PackageOpts = {
  name?: string
  package: string | string[]
  state?: PackageState
  ignoreErrors?: boolean
  when?: Task["when"]
  register?: string
}

function pkgList(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input]
}

async function isInstalled(ctx: Ctx, pkg: string): Promise<boolean> {
  const { pkgMgr } = ctx.facts
  let r: { code: number }
  switch (pkgMgr) {
    case "apt":
      r = await ctx.ssh.run(`dpkg-query -W -f='\${Status}' ${JSON.stringify(pkg)} 2>/dev/null | grep -q 'install ok installed'`)
      break
    case "dnf":
    case "yum":
      r = await ctx.ssh.run(`rpm -q ${JSON.stringify(pkg)} >/dev/null 2>&1`)
      break
    case "apk":
      r = await ctx.ssh.run(`apk info -e ${JSON.stringify(pkg)} >/dev/null 2>&1`)
      break
    case "brew":
      r = await ctx.ssh.run(`brew list --formula ${JSON.stringify(pkg)} >/dev/null 2>&1`)
      break
    default:
      return false
  }
  return r.code === 0
}

async function installPkgs(ctx: Ctx, pkgs: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const list = pkgs.map(p => JSON.stringify(p)).join(" ")
  const { pkgMgr } = ctx.facts
  switch (pkgMgr) {
    case "apt":    return ctx.ssh.run(`DEBIAN_FRONTEND=noninteractive apt-get install -y ${list}`)
    case "dnf":    return ctx.ssh.run(`dnf install -y ${list}`)
    case "yum":    return ctx.ssh.run(`yum install -y ${list}`)
    case "apk":    return ctx.ssh.run(`apk add ${list}`)
    case "brew":   return ctx.ssh.run(`brew install ${list}`)
    default:       return { code: 1, stdout: "", stderr: `unsupported pkgMgr: ${pkgMgr}` }
  }
}

async function removePkgs(ctx: Ctx, pkgs: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const list = pkgs.map(p => JSON.stringify(p)).join(" ")
  const { pkgMgr } = ctx.facts
  switch (pkgMgr) {
    case "apt":    return ctx.ssh.run(`DEBIAN_FRONTEND=noninteractive apt-get remove -y ${list}`)
    case "dnf":    return ctx.ssh.run(`dnf remove -y ${list}`)
    case "yum":    return ctx.ssh.run(`yum remove -y ${list}`)
    case "apk":    return ctx.ssh.run(`apk del ${list}`)
    case "brew":   return ctx.ssh.run(`brew uninstall ${list}`)
    default:       return { code: 1, stdout: "", stderr: `unsupported pkgMgr: ${pkgMgr}` }
  }
}

export function pkg(arg: string | string[] | PackageOpts): Task {
  const opts: PackageOpts =
    typeof arg === "string" || Array.isArray(arg)
      ? { package: arg }
      : arg

  const state: PackageState = opts.state ?? "present"
  const packages = pkgList(opts.package)
  const displayName = packages.join(", ")
  const name = opts.name ?? `package: ${displayName} (${state})`

  return {
    name,
    module: "package",
    ignoreErrors: opts.ignoreErrors,
    when: opts.when,
    register: opts.register,
    run: async (ctx: Ctx): Promise<TaskResult> => {
      const checks = await Promise.all(packages.map(p => isInstalled(ctx, p)))

      if (state === "present") {
        const missing = packages.filter((_, i) => !checks[i])
        if (missing.length === 0) return { ok: true, changed: false, failed: false, stdout: "", stderr: "" }
        if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
        const r = await installPkgs(ctx, missing)
        if (r.code !== 0) return { ok: false, changed: false, failed: true, stdout: r.stdout, stderr: r.stderr, error: `install failed (code ${r.code})` }
        return { ok: true, changed: true, failed: false, stdout: r.stdout, stderr: r.stderr }
      }

      if (state === "absent") {
        const installed = packages.filter((_, i) => checks[i])
        if (installed.length === 0) return { ok: true, changed: false, failed: false, stdout: "", stderr: "" }
        if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
        const r = await removePkgs(ctx, installed)
        if (r.code !== 0) return { ok: false, changed: false, failed: true, stdout: r.stdout, stderr: r.stderr, error: `remove failed (code ${r.code})` }
        return { ok: true, changed: true, failed: false, stdout: r.stdout, stderr: r.stderr }
      }

      // latest: install missing, then upgrade all
      if (ctx.checkMode) return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
      const missing = packages.filter((_, i) => !checks[i])
      if (missing.length > 0) {
        const r = await installPkgs(ctx, missing)
        if (r.code !== 0) return { ok: false, changed: false, failed: true, stdout: r.stdout, stderr: r.stderr, error: `install failed` }
      }
      // upgrade existing
      const existing = packages.filter((_, i) => checks[i])
      if (existing.length > 0) {
        const list = existing.map(p => JSON.stringify(p)).join(" ")
        const { pkgMgr } = ctx.facts
        let r: { code: number; stdout: string; stderr: string }
        switch (pkgMgr) {
          case "apt":  r = await ctx.ssh.run(`DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${list}`); break
          case "dnf":  r = await ctx.ssh.run(`dnf upgrade -y ${list}`); break
          case "yum":  r = await ctx.ssh.run(`yum update -y ${list}`); break
          case "apk":  r = await ctx.ssh.run(`apk upgrade ${list}`); break
          case "brew": r = await ctx.ssh.run(`brew upgrade ${list}`); break
          default:     r = { code: 1, stdout: "", stderr: `unsupported pkgMgr: ${pkgMgr}` }
        }
        if (r.code !== 0) return { ok: false, changed: false, failed: true, stdout: r.stdout, stderr: r.stderr, error: `upgrade failed` }
      }
      return { ok: true, changed: true, failed: false, stdout: "", stderr: "" }
    },
  }
}
